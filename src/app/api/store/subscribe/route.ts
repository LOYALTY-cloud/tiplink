import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { stripe } from "@/lib/stripe/server";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { STORE_PRICE_DOLLARS, chargeStoreFromBalance, recordStoreBalanceInvoice } from "@/lib/store/balanceBilling";
import { addOneMonth } from "@/lib/store/billingDates";

export const runtime = "nodejs";

const STORE_PRICE_CENTS = Math.round(STORE_PRICE_DOLLARS * 100); // $9.99 / month

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

      const now = new Date();
      const charge = await chargeStoreFromBalance({
        userId,
        action: "creator_store_open",
        description: "Creator Store activation fee",
        // The wallet lock + is_active re-check prevent double charges; a unique key avoids
        // replaying an earlier charge when a creator cancels and re-activates the same day.
        idempotencyKey: `store-open-${userId}-${randomUUID()}`,
      });

      if (charge.ok) {
        const { error: upsertErr } = await supabaseAdmin
          .from("creator_stores")
          .upsert(
            {
              user_id: userId,
              is_active: true,
              billing_type: "balance",
              billing_status: "active",
              grace_until: null,
              renews_at: addOneMonth(now).toISOString(),
              updated_at: now.toISOString(),
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

        const { data: storeForInvoice } = await supabaseAdmin
          .from("creator_stores")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        await recordStoreBalanceInvoice({ userId, storeId: storeForInvoice?.id ?? null, status: "paid" });

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
          product_data: { name: "1neLink Creator Store" },
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
