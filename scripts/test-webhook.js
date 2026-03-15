import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const creator = crypto.randomUUID();
  // Ensure a profile and wallet exist
  await supabaseAdmin.from("profiles").upsert({ user_id: creator, handle: `webhook_test_${creator.slice(0,6)}` }, { onConflict: "user_id" });
  await supabaseAdmin.from("wallets").upsert({ user_id: creator, balance: 0, available: 0, pending: 0, withdraw_fee: 0 }, { onConflict: "user_id" });

  const receiptId = `test-${crypto.randomUUID()}`;

  const { data: intent } = await supabaseAdmin.from("tip_intents").insert({ creator_user_id: creator, amount: 1.23, receipt_id: receiptId, status: "pending" }).select().single();
  console.log("Created tip_intent:", intent.id, receiptId);

  async function processWebhook(eventId) {
    // Dedup check
    const { data: existing } = await supabaseAdmin.from("stripe_webhook_events").select("id").eq("id", eventId).maybeSingle();
    if (existing) {
      console.log("Webhook already processed, skipping", eventId);
      return;
    }

    // Mark tip_intents succeeded
    await supabaseAdmin.from("tip_intents").update({ status: "succeeded", stripe_payment_intent_id: `pi_${eventId}` }).eq("receipt_id", receiptId);

    // Insert ledger entry
    await supabaseAdmin.from("transactions_ledger").insert({ user_id: creator, type: "tip_received", amount: 1.23, reference_id: intent.id, meta: { receipt_id: receiptId }, created_at: new Date().toISOString() });

    // Mark webhook processed
    await supabaseAdmin.from("stripe_webhook_events").insert({ id: eventId, type: "payment_intent.succeeded", processed_at: new Date().toISOString() });

    // Trigger recalc (best-effort)
    try { await supabaseAdmin.rpc("recalculate_wallet_balance", { p_user_id: creator }); } catch (e) { console.error("recalc failed", e); }

    console.log("Processed webhook", eventId);
  }

  const evt = `evt_${crypto.randomUUID()}`;
  await processWebhook(evt);
  await processWebhook(evt); // second call should be a no-op

  const { data: ledgerRows } = await supabaseAdmin.from("transactions_ledger").select("id").eq("reference_id", intent.id);
  console.log("Ledger rows referencing intent:", ledgerRows?.length ?? 0);

  if ((ledgerRows?.length ?? 0) === 1) {
    console.log("Webhook dedup test OK");
    process.exit(0);
  } else {
    console.error("Webhook dedup test FAILED");
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
