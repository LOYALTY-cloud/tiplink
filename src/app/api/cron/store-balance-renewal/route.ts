import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import {
  STORE_GRACE_MS,
  STORE_PRICE_DOLLARS,
  chargeStoreFromBalance,
  recordStoreBalanceInvoice,
} from "@/lib/store/balanceBilling";
import { nextRenewalAfter } from "@/lib/store/billingDates";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

type DueStore = {
  id: string;
  user_id: string;
  renews_at: string;
  billing_status: string;
};

const DUE_STORE_FIELDS = "id, user_id, renews_at, billing_status";

/**
 * GET /api/cron/store-balance-renewal?key=CRON_SECRET
 *
 * Monthly billing for stores paid from the creator's balance. Charges the wallet and
 * the connected Stripe balance when `renews_at` is due. A failed charge moves the store
 * to past_due with the same grace period as card failures; it is retried on every run
 * and /api/cron/store-grace-expiry deactivates it when the grace period ends.
 *
 * Stores without `renews_at` (free owner stores, stores created before renewals existed)
 * are never billed here.
 */
export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = new URL(req.url).searchParams.get("key");
  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();

  const { data: dueStores, error } = await supabaseAdmin
    .from("creator_stores")
    .select(DUE_STORE_FIELDS)
    .eq("billing_type", "balance")
    .eq("is_active", true)
    .in("billing_status", ["active", "past_due"])
    .is("stripe_subscription_id", null)
    .not("renews_at", "is", null)
    .lte("renews_at", nowIso)
    .order("renews_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[store-balance-renewal] failed to load due stores:", error);
    return NextResponse.json({ error: "Failed to load due stores." }, { status: 500 });
  }

  const summary = { scanned: (dueStores ?? []).length, renewed: 0, past_due: 0, skipped: 0, errors: 0 };

  for (const candidate of (dueStores ?? []) as DueStore[]) {
    const lock = await acquireWalletLock(supabaseAdmin, candidate.user_id, "withdrawal", 120);
    if (!lock.ok) {
      summary.skipped += 1;
      continue;
    }

    try {
      // Re-read under the lock: the creator may have canceled or switched billing meanwhile.
      const { data: store } = await supabaseAdmin
        .from("creator_stores")
        .select(DUE_STORE_FIELDS)
        .eq("id", candidate.id)
        .eq("billing_type", "balance")
        .eq("is_active", true)
        .in("billing_status", ["active", "past_due"])
        .is("stripe_subscription_id", null)
        .lte("renews_at", new Date().toISOString())
        .maybeSingle<DueStore>();

      if (!store) {
        summary.skipped += 1;
        continue;
      }

      const charge = await chargeStoreFromBalance({
        userId: store.user_id,
        action: "creator_store_renewal",
        description: "Creator Store monthly renewal",
        // One charge per billing cycle, even if this job is re-run.
        idempotencyKey: `store-renewal-${store.id}-${store.renews_at}`,
      });

      if (charge.ok) {
        const now = new Date();
        const { error: updateErr } = await supabaseAdmin
          .from("creator_stores")
          .update({
            billing_status: "active",
            grace_until: null,
            renews_at: nextRenewalAfter(new Date(store.renews_at), now).toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", store.id);

        if (updateErr) {
          // Charged but renews_at not advanced: the next run would try to bill this cycle again.
          console.error("[store-balance-renewal] renewal date update failed after charge", store.id, updateErr);
          const { sendAdminAlert } = await import("@/lib/adminAlerts");
          sendAdminAlert({
            subject: "Store renewal charged but renews_at update failed",
            body: `Store ${store.id} (user ${store.user_id}) was charged $${STORE_PRICE_DOLLARS} but renews_at was not advanced: ${updateErr.message}. Fix renews_at manually to avoid a double charge.`,
            severity: "critical",
            meta: { storeId: store.id, userId: store.user_id },
          });
          summary.errors += 1;
          continue;
        }

        await recordStoreBalanceInvoice({ userId: store.user_id, storeId: store.id, status: "paid" });
        summary.renewed += 1;
        continue;
      }

      console.warn(`[store-balance-renewal] charge failed for store ${store.id}: ${charge.reason}`, charge.detail ?? "");

      // Only the first failure of a cycle starts the grace period and notifies the creator.
      if (store.billing_status === "active") {
        const graceUntil = new Date(Date.now() + STORE_GRACE_MS);
        const { error: pastDueErr } = await supabaseAdmin
          .from("creator_stores")
          .update({
            billing_status: "past_due",
            grace_until: graceUntil.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", store.id);

        if (pastDueErr) {
          console.error("[store-balance-renewal] failed to mark past_due", store.id, pastDueErr);
          summary.errors += 1;
          continue;
        }

        await recordStoreBalanceInvoice({ userId: store.user_id, storeId: store.id, status: "failed" });

        createNotification({
          userId: store.user_id,
          type: "system",
          title: "Creator Store payment failed",
          body: `We couldn't charge $${STORE_PRICE_DOLLARS.toFixed(2)} for your Creator Store renewal from your available balance. Add funds before ${graceUntil.toLocaleDateString("en-US")} to keep your store active.`,
        }).catch((e) => console.error("[store-balance-renewal] notification failed", e));
      }

      summary.past_due += 1;
    } catch (e) {
      console.error("[store-balance-renewal] unexpected error for store", candidate.id, e);
      summary.errors += 1;
    } finally {
      await releaseWalletLock(supabaseAdmin, candidate.user_id, "withdrawal");
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
