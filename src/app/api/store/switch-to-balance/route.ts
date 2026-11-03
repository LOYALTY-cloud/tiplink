import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { stripe } from "@/lib/stripe/server";
import { randomUUID } from "node:crypto";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { chargeStoreFromBalance, recordStoreBalanceInvoice } from "@/lib/store/balanceBilling";
import { addOneMonth } from "@/lib/store/billingDates";

export const runtime = "nodejs";

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
    .select("id, stripe_subscription_id, is_active, billing_status, renews_at")
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
      const charge = await chargeStoreFromBalance({
        userId,
        action: "creator_store_recovery",
        description: "Creator Store recovery charge",
        idempotencyKey: `store-recovery-${userId}-${randomUUID()}`,
      });

      if (!charge.ok) {
        return NextResponse.json(
          {
            error:
              charge.reason === "insufficient_balance"
                ? "Insufficient balance to recover store billing. Add funds or retry card payment."
                : "We couldn't collect payment from your Stripe balance. Funds may still be pending — retry shortly or use card payment.",
          },
          { status: 400 }
        );
      }

      await recordStoreBalanceInvoice({ userId, storeId: store.id, status: "paid" });
    } finally {
      await releaseWalletLock(supabaseAdmin, userId, "withdrawal");
    }
  }

  // Switching from a paid card cycle keeps its renewal date; a recovery charge starts a new cycle.
  const now = new Date();
  const existingRenewal = store.renews_at ? new Date(store.renews_at) : null;
  const renewsAt =
    !recoveringPastDue && existingRenewal && existingRenewal.getTime() > now.getTime()
      ? existingRenewal
      : addOneMonth(now);

  let { error: updateErr } = await supabaseAdmin
    .from("creator_stores")
    .update({
      billing_type: "balance",
      billing_status: "active",
      grace_until: null,
      is_active: true,
      stripe_subscription_id: null,
      renews_at: renewsAt.toISOString(),
      updated_at: now.toISOString(),
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
