/**
 * reconcileMissingTips.ts
 *
 * One-off script to fix tip_intents that are stuck at `created` status
 * because the Stripe webhook failed to process payment_intent.succeeded events.
 *
 * For each tip_intent with status=created and a real Stripe PI ID:
 *   1. Query Stripe to get the actual PI status
 *   2. If the PI is `succeeded`, create a ledger entry and mark the tip as succeeded
 *   3. Report a summary of processed vs skipped tips
 *
 * Usage:
 *   npx tsx dev-tools/scripts/reconcileMissingTips.ts
 *   # To dry-run (no writes):
 *   DRY_RUN=true npx tsx dev-tools/scripts/reconcileMissingTips.ts
 *   # To limit to one user:
 *   USER_ID=49593d9b-3b4d-4425-98a9-fb67fcd97c90 npx tsx dev-tools/scripts/reconcileMissingTips.ts
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const DRY_RUN = process.env.DRY_RUN === "true";
const FILTER_USER = process.env.USER_ID ?? null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// ── helpers ──────────────────────────────────────────────────────────────────

async function addLedgerEntry(params: {
  user_id: string;
  type: string;
  amount: number;
  reference_id: string;
  meta: Record<string, unknown>;
}) {
  // Try atomic RPC first; fall back to direct insert + recalculate
  const rpcPayload = {
    p_user_id: params.user_id,
    p_type: params.type,
    p_amount: params.amount,
    p_reference_id: params.reference_id,
    p_meta: params.meta,
    p_status: "completed",
  };

  const { error: rpcErr } = await supabase.rpc("add_ledger_entry_atomic", rpcPayload);

  if (rpcErr) {
    if (rpcErr.message.includes("function") && rpcErr.message.includes("does not exist")) {
      // Legacy fallback
      const { error: insertErr } = await supabase.from("transactions_ledger").insert({
        user_id: params.user_id,
        type: params.type,
        amount: params.amount,
        reference_id: params.reference_id,
        meta: params.meta,
        status: "completed",
        created_at: new Date().toISOString(),
      });
      if (insertErr) throw new Error(`Ledger insert failed: ${insertErr.message}`);

      const { error: recalcErr } = await supabase.rpc("recalculate_wallet_balance", {
        p_user_id: params.user_id,
      });
      if (recalcErr) throw new Error(`Wallet recalculate failed: ${recalcErr.message}`);
    } else {
      throw new Error(`Ledger RPC failed: ${rpcErr.message}`);
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== reconcileMissingTips ${DRY_RUN ? "[DRY RUN]" : "[LIVE]"} ===\n`);

  // Fetch all stuck tip_intents
  let query = supabase
    .from("tip_intents")
    .select("*")
    .eq("status", "created")
    .not("stripe_payment_intent_id", "is", null)
    .not("stripe_payment_intent_id", "like", "pi_test_%"); // skip seeded test data

  if (FILTER_USER) {
    query = query.eq("creator_user_id", FILTER_USER);
    console.log(`Filtering to user: ${FILTER_USER}`);
  }

  const { data: intents, error: fetchErr } = await query.order("created_at", { ascending: true });

  if (fetchErr) {
    console.error("Failed to fetch tip_intents:", fetchErr);
    process.exit(1);
  }

  console.log(`Found ${intents?.length ?? 0} stuck tip_intents to check.\n`);

  let skipped = 0;
  let processed = 0;
  let errors = 0;

  for (const intent of intents ?? []) {
    const piId: string = intent.stripe_payment_intent_id;
    console.log(`Checking tip ${intent.receipt_id} | $${intent.tip_amount} | PI: ${piId}`);

    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(piId);
    } catch (e: any) {
      console.error(`  ✗ Stripe fetch failed: ${e.message}`);
      errors++;
      continue;
    }

    if (pi.status !== "succeeded") {
      console.log(`  → Stripe status: ${pi.status} — skipping`);
      skipped++;
      continue;
    }

    console.log(`  → Stripe status: succeeded — processing...`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would process $${intent.tip_amount} for user ${intent.creator_user_id}`);
      processed++;
      continue;
    }

    try {
      const receivedAmount = Number(intent.tip_amount ?? intent.amount ?? 0);

      await addLedgerEntry({
        user_id: intent.creator_user_id,
        type: "tip_received",
        amount: receivedAmount,
        reference_id: intent.id,
        meta: {
          action: "tip",
          fee: Number(intent.stripe_fee ?? 0) + Number(intent.platform_fee ?? 0),
          net: receivedAmount,
          stripe_fee: Number(intent.stripe_fee ?? 0),
          platform_fee: Number(intent.platform_fee ?? 0),
          currency: pi.currency,
          receipt_id: intent.receipt_id,
          reconciled: true,
          external_id: pi.id,
          supporter_name: intent.is_anonymous ? null : (intent.supporter_name || null),
          message: intent.message || null,
          is_anonymous: intent.is_anonymous ?? true,
        },
      });

      await supabase
        .from("tip_intents")
        .update({ status: "succeeded" })
        .eq("id", intent.id);

      console.log(`  ✓ Credited $${receivedAmount} to user ${intent.creator_user_id}`);
      processed++;
    } catch (e: any) {
      console.error(`  ✗ Processing failed: ${e.message}`);
      errors++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`  Processed (credited): ${processed}`);
  console.log(`  Skipped (not succeeded on Stripe): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
