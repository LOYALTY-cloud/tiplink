import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { stripe } from "@/lib/stripe/server";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";

export const runtime = "nodejs";

const STORE_PRICE_CENTS = 999; // $9.99 / month
const STORE_PRICE_DOLLARS = STORE_PRICE_CENTS / 100;

/**
 * POST /api/store/subscribe
 *
 * Creates a Stripe Checkout subscription session for the Creator Store monthly plan.
 * Available to all creators.
 * Idempotent: if a store already exists and is_active, returns a 200 with no redirect.
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId, owner_elite } = session;

  // Idempotent: already subscribed?
  const { data: existing } = await supabaseAdmin
    .from("creator_stores")
    .select("id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.is_active) {
    return NextResponse.json({ already_active: true });
  }

  // Owner bypass: activate store for free with no monthly billing.
  if (owner_elite) {
    let { error: upsertErr } = await supabaseAdmin
      .from("creator_stores")
      .upsert(
        {
          user_id: userId,
          is_active: true,
          billing_type: "balance",
          billing_status: "active",
          grace_until: null,
          renews_at: null,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      const fallback = await supabaseAdmin
        .from("creator_stores")
        .upsert(
          {
            user_id: userId,
            is_active: true,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      upsertErr = fallback.error;
    }

    if (upsertErr) {
      console.error("store/subscribe owner activation:", upsertErr);
      return NextResponse.json({ error: "Failed to activate owner store" }, { status: 500 });
    }

    return NextResponse.json({ activated_owner_free: true });
  }

  // First attempt: pay with in-app wallet balance if enough funds are available.
  // Falls back to Stripe card checkout only when balance is insufficient.
  const lock = await acquireWalletLock(supabaseAdmin, userId, "withdrawal", 120);
  if (lock.ok) {
    try {
      // Re-check activation state while under lock to avoid double-charging races.
      const { data: existingLocked } = await supabaseAdmin
        .from("creator_stores")
        .select("id, is_active")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingLocked?.is_active) {
        return NextResponse.json({ already_active: true });
      }

      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      const balance = Number(wallet?.balance ?? 0);

      if (Number.isFinite(balance) && balance >= STORE_PRICE_DOLLARS) {
        await addLedgerEntry({
          user_id: userId,
          type: "fee",
          amount: -STORE_PRICE_DOLLARS,
          meta: {
            action: "creator_store_open",
            payment_method: "wallet_balance",
            amount_usd: STORE_PRICE_DOLLARS,
            description: "Creator Store activation fee",
          },
          status: "completed",
        });

        const { error: upsertErr } = await supabaseAdmin
          .from("creator_stores")
          .upsert(
            {
              user_id: userId,
              is_active: true,
              billing_type: "balance",
              billing_status: "active",
              grace_until: null,
              renews_at: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (upsertErr) {
          await supabaseAdmin
            .from("creator_stores")
            .upsert(
              {
                user_id: userId,
                is_active: true,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );
        }

        // Best-effort invoice log for wallet billing events.
        const { data: storeForInvoice } = await supabaseAdmin
          .from("creator_stores")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        await supabaseAdmin
          .from("store_invoices")
          .insert({
            user_id: userId,
            store_id: storeForInvoice?.id ?? null,
            amount: STORE_PRICE_DOLLARS,
            status: "paid",
            billing_type: "balance",
            paid_at: new Date().toISOString(),
          });

        return NextResponse.json({ activated_with_balance: true });
      }
    } finally {
      await releaseWalletLock(supabaseAdmin, userId, "withdrawal");
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: STORE_PRICE_CENTS,
          recurring: { interval: "month" },
          product_data: { name: "TipLink Creator Store" },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "store_subscription",
      user_id: userId,
      store_id: existing?.id ?? "",
    },
    subscription_data: {
      metadata: {
        type: "store_subscription",
        user_id: userId,
        store_id: existing?.id ?? "",
      },
    },
    success_url: `${siteUrl}/dashboard/themebuilder?store=success`,
    cancel_url:  `${siteUrl}/dashboard/themebuilder`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
