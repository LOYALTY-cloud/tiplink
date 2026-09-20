/**
 * One-off, manually-triggered recovery execution for the two $10.61 historical
 * disputes on acct_1UAre8RQMSx81Izn (rejected.fraud). Executed under explicit
 * user authorization after the read-only investigation + reversal plan.
 *
 * Sequencing (per explicit instruction):
 *   1. Verify transfer is still unreversed (idempotency guard)
 *   2. Execute stripe.transfers.createReversal()
 *   3. ONLY on confirmed success: log admin_actions (no wallet balance change —
 *      the -$10.61 ledger debit already exists from the original dispute;
 *      adding another would double-debit the creator)
 *   4. ONLY after that: send in-app notification + email (reuses the real
 *      createNotification() pipeline, not a reimplementation)
 *
 * This does NOT touch the "healthy" account's 11 disputes (Group 1) — those
 * remain a separate decision.
 *
 * Usage: npx tsx --env-file=.env.local dev-tools/scripts/recover-group2-disputes.ts
 */
import Stripe from "stripe";
import { supabaseAdmin } from "../../src/lib/supabase/admin";
import { createNotification } from "../../src/lib/notifications";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });

const CREATOR_USER_ID = "43a26203-a16b-447b-98ca-6a4135a41ac8";
const DISPUTES = [
  { du: "du_1UHbAqEukZyx2zfV4G8xYjl3", pi: "pi_3UBa4NEukZyx2zfV1eENbOeg", transfer: "tr_3UBa4NEukZyx2zfV1JxIqvlu", amount_cents: 1061 },
  { du: "du_1UHasfEukZyx2zfVLhfl8c9t", pi: "pi_3UBa9YEukZyx2zfV1WEgjsgY", transfer: "tr_3UBa9YEukZyx2zfV1T59XkGs", amount_cents: 1061 },
];

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_live_")) {
    console.error("Refusing to run: STRIPE_SECRET_KEY is not the live key — these are real live-mode disputes.");
    process.exit(1);
  }

  for (const d of DISPUTES) {
    console.log(`\n── ${d.du} (transfer ${d.transfer}) ──`);

    // Step 1: idempotency guard — re-verify live, unreversed state
    const transfer = await stripe.transfers.retrieve(d.transfer);
    if ((transfer.amount_reversed ?? 0) > 0 || transfer.reversed) {
      console.log(`  SKIP — already reversed (amount_reversed=${transfer.amount_reversed})`);
      continue;
    }
    if (transfer.amount !== d.amount_cents) {
      console.log(`  ABORT — transfer amount mismatch: expected ${d.amount_cents}, got ${transfer.amount}`);
      continue;
    }

    // Step 2: execute the reversal (real money movement)
    let reversal;
    try {
      reversal = await stripe.transfers.createReversal(d.transfer, {
        amount: d.amount_cents,
        description: `Dispute recovery: ${d.du}`,
      });
      console.log(`  ✅ Reversal created: ${reversal.id}, amount=${reversal.amount}¢`);
    } catch (e: unknown) {
      console.error(`  ❌ Reversal FAILED: ${e instanceof Error ? e.message : e}`);
      continue; // do not log success or notify on failure
    }

    // Step 3: audit log only — no wallet balance change (debit already exists)
    const { error: actionErr } = await supabaseAdmin.from("admin_actions").insert({
      admin_id: null,
      action: "dispute_transfer_reversed",
      target_user: CREATOR_USER_ID,
      metadata: {
        dispute_id: d.du,
        payment_intent_id: d.pi,
        transfer_id: d.transfer,
        reversal_id: reversal.id,
        amount_cents: d.amount_cents,
        connected_account: transfer.destination,
        note: "Historical destination-charge dispute recovery. No new ledger debit added — original debit already recorded at dispute time.",
      },
      severity: "critical",
    });
    if (actionErr) console.error(`  ⚠️ admin_actions log failed (reversal already succeeded): ${actionErr.message}`);
    else console.log(`  ✅ admin_actions audit row logged`);

    // Step 4: in-app notification + email — only now, after confirmed success
    const amountDollars = d.amount_cents / 100;
    await createNotification({
      userId: CREATOR_USER_ID,
      type: "dispute",
      title: "A payment you received was disputed",
      body: `A $${amountDollars.toFixed(2)} tip was disputed by the customer's bank as fraudulent. This amount was already deducted from your balance when the dispute was reported. No further action is needed from you.`,
      meta: { amount: amountDollars, reason: "fraudulent" },
    });
    console.log(`  ✅ In-app notification + email sent to ${CREATOR_USER_ID}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
