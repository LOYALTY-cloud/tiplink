import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { stripe } from "@/lib/stripe/server";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";

export const runtime = "nodejs";
const STORE_PRICE_DOLLARS = 9.99;

/**
 * POST /api/store/switch-to-balance
 * Cancels active Stripe subscription (if any) and switches store billing to balance.
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const { data: store, error: fetchErr } = await supabaseAdmin
    .from("creator_stores")
    .select("id, stripe_subscription_id, is_active, billing_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: "Failed to load store" }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  if (store.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(store.stripe_subscription_id);
    } catch (e) {
      console.error("store/switch-to-balance stripe cancel:", e);
      return NextResponse.json({ error: "Failed to cancel card subscription" }, { status: 400 });
    }
  }

  const recoveringPastDue = store.billing_status === "past_due";

  if (recoveringPastDue) {
    const lock = await acquireWalletLock(supabaseAdmin, userId, "withdrawal", 120);
    if (!lock.ok) {
      return NextResponse.json({ error: "Recovery is in progress. Please retry in a few seconds." }, { status: 409 });
    }

    try {
      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      const balance = Number(wallet?.balance ?? 0);
      if (!Number.isFinite(balance) || balance < STORE_PRICE_DOLLARS) {
        return NextResponse.json(
          { error: "Insufficient balance to recover store billing. Add funds or retry card payment." },
          { status: 400 }
        );
      }

      await addLedgerEntry({
        user_id: userId,
        type: "fee",
        amount: -STORE_PRICE_DOLLARS,
        meta: {
          action: "creator_store_recovery",
          payment_method: "wallet_balance",
          amount_usd: STORE_PRICE_DOLLARS,
          description: "Creator Store recovery charge",
        },
        status: "completed",
      });

      const { error: invoiceErr } = await supabaseAdmin
        .from("store_invoices")
        .insert({
          user_id: userId,
          store_id: store.id,
          amount: STORE_PRICE_DOLLARS,
          status: "paid",
          billing_type: "balance",
          paid_at: new Date().toISOString(),
        });

      if (invoiceErr) {
        // Ledger already charged — alert admin so billing record can be manually created
        console.error("store/switch-to-balance: invoice insert failed after ledger charge", {
          userId, storeId: store.id, amount: STORE_PRICE_DOLLARS, error: invoiceErr.message,
        });
        try {
          const { sendAdminAlert } = await import("@/lib/adminAlerts");
          sendAdminAlert({
            subject: "store/switch-to-balance: store_invoices insert failed",
            body: `User ${userId} was charged $${STORE_PRICE_DOLLARS} but no invoice record was created. Manual reconciliation required.`,
            severity: "critical",
            meta: { userId, storeId: store.id, amount: STORE_PRICE_DOLLARS, error: invoiceErr.message },
          });
        } catch (_) {}
      }
    } finally {
      await releaseWalletLock(supabaseAdmin, userId, "withdrawal");
    }
  }

  let { error: updateErr } = await supabaseAdmin
    .from("creator_stores")
    .update({
      billing_type: "balance",
      billing_status: "active",
      grace_until: null,
      is_active: true,
      stripe_subscription_id: null,
      renews_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", store.id);

  if (updateErr) {
    const fallback = await supabaseAdmin
      .from("creator_stores")
      .update({
        is_active: true,
        billing_status: "active",
        grace_until: null,
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", store.id);
    updateErr = fallback.error;
  }

  if (updateErr) {
    return NextResponse.json({ error: "Failed to switch billing" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
