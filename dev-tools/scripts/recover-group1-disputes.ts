/**
 * One-off recovery script for the 10 "needs_response" Group 1 disputes on
 * acct_1UBaUgEWwVHB2xNZ ($20.91 each, reason=fraudulent). These originated
 * under the old destination-charge architecture, so the chargeback debited
 * the PLATFORM's Stripe balance while the original transfer to the creator's
 * connected account was never reversed — leaving the platform balance
 * negative while the creator's connected account still holds the disputed
 * funds.
 *
 * The creator's in-app wallet ledger was ALREADY debited -$20.91 per dispute
 * by the webhook at the time each dispute was reported (type: "tip_refunded",
 * meta.action: "dispute") — so this script does NOT add a second debit. It
 * only:
 *   1. Reverses the Stripe transfer that sent the disputed funds to the
 *      connected account (pulls the money back to the platform).
  *   2. On confirmed success, inserts a new $0 "adjustment" audit row (the
 *      ledger is append-only — a DB trigger blocks UPDATE/DELETE — so this
 *      records recovery confirmation without touching the original debit).
 *   3. On confirmed success, sends one in-app notification + email per
 *      dispute (via createNotification, type: "dispute").
 *
 * Any dispute whose reversal fails is left completely untouched — no partial
 * notifications, no partial ledger writes.
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createNotification } from "../../src/lib/notifications";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const disputes = await stripe.disputes.list({ limit: 100 });
  const group1 = disputes.data.filter((d) => d.status === "needs_response");

  console.log(`Found ${group1.length} needs_response disputes to recover.\n`);

  const results: Array<{ dispute: string; ok: boolean; detail: string }> = [];

  for (const d of group1) {
    const chargeId = typeof d.charge === "string" ? d.charge : d.charge.id;
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      const transferId = typeof charge.transfer === "string" ? charge.transfer : charge.transfer?.id;
      if (!transferId) {
        results.push({ dispute: d.id, ok: false, detail: "No transfer found on charge — skipped" });
        continue;
      }

      const transfer = await stripe.transfers.retrieve(transferId);
      if (transfer.amount_reversed >= transfer.amount) {
        results.push({ dispute: d.id, ok: false, detail: "Already fully reversed — skipped" });
        continue;
      }

      // ── Step 1: reverse the transfer (pulls funds back to platform) ──
      const reversal = await stripe.transfers.createReversal(transferId, {
        amount: transfer.amount - transfer.amount_reversed,
      });

      // Verify by re-reading the transfer
      const verifyTransfer = await stripe.transfers.retrieve(transferId);
      if (verifyTransfer.amount_reversed < transfer.amount) {
        results.push({ dispute: d.id, ok: false, detail: `Reversal created (${reversal.id}) but amount_reversed mismatch — NOT proceeding with notify/ledger` });
        continue;
      }

      // ── Step 2: record a zero-amount audit row (no balance impact) ──
      // transactions_ledger is append-only (a DB trigger blocks UPDATE/DELETE),
      // so the recovery confirmation is a new $0 "adjustment" row, not a
      // mutation of the original debit that already happened when the
      // dispute was first reported.
      const { data: originalRow } = await db
        .from("transactions_ledger")
        .select("id, user_id")
        .contains("meta", { dispute_id: d.id })
        .maybeSingle();

      const userId = originalRow?.user_id as string | undefined;
      if (userId) {
        await db.from("transactions_ledger").insert({
          user_id: userId,
          type: "adjustment",
          amount: 0,
          status: "completed",
          meta: {
            action: "dispute_fund_recovered",
            dispute_id: d.id,
            transfer_reversal_id: reversal.id,
            recovered_amount: reversal.amount / 100,
            recovered_at: new Date().toISOString(),
            note: "Platform reclaimed disputed funds from connected account via transfer reversal. No wallet balance impact — creator was already debited when the dispute was originally reported.",
          },
        });
      }

      // ── Step 3: notify (in-app + email) — only after confirmed success ──
      if (userId) {
        await createNotification({
          userId,
          type: "dispute",
          title: "Payment Disputed",
          body: `A $${(d.amount / 100).toFixed(2)} tip was disputed by the supporter (reason: ${d.reason}).`,
          meta: { amount: d.amount / 100, reason: d.reason },
        });
      }

      results.push({
        dispute: d.id,
        ok: true,
        detail: `Reversed $${(reversal.amount / 100).toFixed(2)} via ${reversal.id}; audit row ${userId ? "inserted" : "SKIPPED (no user found)"}; notified ${userId ? "yes" : "no"}`,
      });
    } catch (err) {
      results.push({ dispute: d.id, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log("\n=== RESULTS ===");
  for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.dispute}: ${r.detail}`);
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} disputes recovered successfully.`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
