import { createClient } from "@supabase/supabase-js";
import { handleStripeEvent } from "../src/app/api/stripe/webhook/route";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ledgerFn(entry: any) {
  const insertPayload: any = {
    user_id: entry.user_id,
    type: entry.type,
    amount: entry.amount,
    reference_id: entry.reference_id ?? null,
    metadata: entry.meta ?? entry.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("transactions_ledger").insert(insertPayload).select().single();
  if (error) throw new Error(`Ledger insert failed: ${error.message}`);

  const { error: recalcErr } = await supabase.rpc("recalculate_wallet_balance", { p_user_id: entry.user_id });
  if (recalcErr) throw new Error(`Recalc failed: ${recalcErr.message}`);

  return data ?? null;
}

const KEEP_TEST_DATA = process.env.KEEP_TEST_DATA === "1";

async function run() {
  console.log("Running tip flow test...");
  const creatorId = process.env.TEST_CREATOR_ID || "00000000-0000-4000-8000-000000000000";
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
