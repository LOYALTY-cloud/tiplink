import { createClient } from "@supabase/supabase-js";
import { handleStripeEvent } from "../src/app/api/stripe/webhook/route";

// Load .env.local values into process.env for local test runs (non-blocking)
try {
  const fs = require("fs");
  if (fs.existsSync(".env.local")) {
    const lines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx);
      const val = line.slice(idx + 1);
      process.env[key] = val;
    }
  }
} catch (e) {}

let supabase: any;

async function ledgerFn(entry: any) {
  const insertPayload: any = {
    user_id: entry.user_id,
    type: entry.type,
    amount: entry.amount,
    reference_id: entry.reference_id ?? null,
    metadata: entry.meta ?? entry.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  // Resolve profile.id if transactions_ledger.user_id now references profiles(id)
  try {
    const { data: pById } = await supabase.from("profiles").select("id").eq("id", insertPayload.user_id).maybeSingle();
    console.log("debug: pById=", pById);
    if (pById && pById.id) {
      insertPayload.user_id = pById.id;
    } else {
      const { data: pByUser } = await supabase.from("profiles").select("id").eq("user_id", insertPayload.user_id).maybeSingle();
      console.log("debug: pByUser=", pByUser);
      if (pByUser && pByUser.id) insertPayload.user_id = pByUser.id;
      else {
        // Try to create a minimal profile for testing environments
        try {
          const { data: ins, error: insErr } = await supabase.from("profiles").insert({ user_id: insertPayload.user_id, handle: insertPayload.user_id }).select("id").maybeSingle();
          console.log("debug: insert profile result=", ins, insErr);
          if (ins && ins.id) insertPayload.user_id = ins.id;
        } catch (e) { console.log("debug: insert profile caught", e); }
      }
    }
  } catch (e) {}

  const { data, error } = await supabase.from("transactions_ledger").insert(insertPayload).select().single();
  if (error) throw new Error(`Ledger insert failed: ${error.message}`);

  const { error: recalcErr } = await supabase.rpc("recalculate_wallet_balance", { p_user_id: entry.user_id });
  if (recalcErr) throw new Error(`Recalc failed: ${recalcErr.message}`);

  return data ?? null;
}

const KEEP_TEST_DATA = process.env.KEEP_TEST_DATA === "1";

async function run() {
  console.log("Running tip flow test...");
  console.log("debug env TEST_CREATOR_ID=", process.env.TEST_CREATOR_ID);
  const creatorId = process.env.TEST_CREATOR_ID || "00000000-0000-4000-8000-000000000000";
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const receiptId = crypto.randomUUID();
  let tipIntentId: string | null = null;

  try {
    // create a fake tip intent
    const { data: insertData, error: insertErr } = await supabase.from("tip_intents").insert({
      creator_user_id: creatorId,
      tip_amount: 10,
      receipt_id: receiptId,
      status: "pending",
      stripe_fee: 0,
      platform_fee: 0,
      total_charge: 10,
    }).select().single();
    if (insertErr || !insertData) throw new Error(`Failed to insert tip_intent: ${insertErr?.message}`);
    tipIntentId = insertData.id ?? insertData.receipt_id ?? null;

    const mockEvent = {
      id: "evt_test_" + Date.now(),
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_" + Date.now(),
          metadata: {
            receipt_id: receiptId,
          },
        },
      },
    } as any;

    // Call the handler with our supabase client and ledger function
    await handleStripeEvent(mockEvent, supabase, ledgerFn);

    let { data, error } = await supabase
      .from("transactions_ledger")
      .select("*")
      .eq("reference_id", receiptId);

    // Fallback: some ledger entries store receipt_id inside metadata
    if ((!data || data.length === 0) && !error) {
      const fallback = await supabase.from('transactions_ledger').select('*').eq("metadata->>receipt_id", receiptId);
      if (fallback.error) throw new Error(`Failed to query ledger (fallback): ${fallback.error.message}`);
      if (fallback.data && fallback.data.length) {
        data = fallback.data;
      }
    }

    if (error) throw new Error(`Failed to query ledger: ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error("Ledger entry was not created");
    }

    console.log("✅ Tip flow test passed");
  } finally {
    if (KEEP_TEST_DATA) {
      console.log("KEEP_TEST_DATA=1, skipping cleanup");
      return;
    }

    // Cleanup test rows: ledger entries and tip_intents
    try {
      if (tipIntentId) {
        await supabase.from("transactions_ledger").delete().eq("reference_id", tipIntentId);
        await supabase.from("tip_intents").delete().eq("id", tipIntentId);
      } else {
        // Fallback: delete by receipt id
        await supabase.from("transactions_ledger").delete().eq("reference_id", receiptId);
        await supabase.from("tip_intents").delete().eq("receipt_id", receiptId);
      }
      // Recalculate wallet to revert any changes
      const { error: recalcErr } = await supabase.rpc("recalculate_wallet_balance", { p_user_id: creatorId });
      if (recalcErr) console.warn("Recalc after cleanup failed:", recalcErr.message);
      console.log("Cleanup completed");
    } catch (cleanupErr) {
      console.warn("Cleanup failed:", cleanupErr);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
