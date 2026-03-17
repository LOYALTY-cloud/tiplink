import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Create a real auth user so all FK constraints are satisfied
  const testEmail = `webhook_test_${crypto.randomUUID().slice(0, 8)}@test.local`;
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
  });

  if (authError || !authData?.user) {
    console.error("AUTH USER CREATE ERROR:", authError ?? "no user returned");
    process.exit(1);
  }

  const creator = authData.user.id;
  console.log("Auth user created:", creator);

  // Ensure profile exists with id = creator so FK constraints are satisfied
  // (transactions_ledger.user_id and wallets.user_id both reference profiles(id))
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: creator, user_id: creator, handle: `webhook_test_${creator.slice(0, 6)}` }, { onConflict: "user_id" });

  if (profileError) {
    console.error("PROFILE UPSERT ERROR:", profileError);
    process.exit(1);
  }
  console.log("Profile ensured:", creator);

  const { error: walletError } = await supabaseAdmin
    .from("wallets")
    .upsert({ user_id: creator, balance: 0, available: 0, pending: 0 }, { onConflict: "user_id" });

  if (walletError) {
    console.error("WALLET UPSERT ERROR:", walletError);
    process.exit(1);
  }

  const receiptId = crypto.randomUUID();

  const insertPayload = { creator_user_id: creator, tip_amount: 1.23, total_charge: 1.23, stripe_fee: 0, platform_fee: 0, receipt_id: receiptId, status: "pending" };
  console.log("INSERT PAYLOAD:", insertPayload);

  const { data: intent, error: insertErr } = await supabaseAdmin
    .from("tip_intents")
    .insert(insertPayload)
    .select()
    .single();

  if (insertErr || !intent) {
    console.error("Failed to insert tip_intent:", insertErr ?? intent);
    process.exit(1);
  }

  console.log("Created tip_intent:", intent.id, receiptId);

  async function processWebhook(eventId) {
    // Dedup check
    const { data: existing, error: dupErr } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    if (dupErr) {
      console.error("Dedup check failed:", dupErr);
      throw dupErr;
    }
    if (existing) {
      console.log("Webhook already processed, skipping", eventId);
      return;
    }

    // Mark tip_intents succeeded
    const { error: updErr } = await supabaseAdmin
      .from("tip_intents")
      .update({ status: "succeeded", stripe_payment_intent_id: `pi_${eventId}` })
      .eq("receipt_id", receiptId);
    if (updErr) {
      console.error("Failed to update tip_intents:", updErr);
      throw updErr;
    }

    // Insert ledger entry
    const { data: ledgerRow, error: ledgerErr } = await supabaseAdmin
      .from("transactions_ledger")
      .insert({ user_id: creator, type: "tip_received", amount: 1.23, reference_id: receiptId, meta: { receipt_id: receiptId }, created_at: new Date().toISOString() })
      .select()
      .single();
    if (ledgerErr || !ledgerRow) {
      console.error("Failed to insert ledger row:", ledgerErr ?? ledgerRow);
      throw ledgerErr ?? new Error("No ledger row returned");
    }

    // Mark webhook processed
    const { error: markErr } = await supabaseAdmin
      .from("stripe_webhook_events")
      .insert({ id: eventId, type: "payment_intent.succeeded", processed_at: new Date().toISOString() });
    if (markErr) {
      console.error("Failed to mark webhook processed:", markErr);
      throw markErr;
    }

    // Trigger recalc (best-effort)
    try { await supabaseAdmin.rpc("recalculate_wallet_balance", { p_user_id: creator }); } catch (e) { console.error("recalc failed", e); }

    console.log("Processed webhook", eventId);
  }

  const evt = `evt_${crypto.randomUUID()}`;
  await processWebhook(evt);
  await processWebhook(evt); // second call should be a no-op

  const { data: ledgerRows } = await supabaseAdmin.from("transactions_ledger").select("id").eq("reference_id", receiptId);
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
