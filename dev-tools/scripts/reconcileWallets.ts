import { createClient } from "@supabase/supabase-js";

// Load your Supabase keys from environment
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

// Create Supabase client with service role for full DB access
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function reconcileWallets() {
  console.log("Starting wallet reconciliation...");

  // Fetch all wallets and compute expected balance from the ledger
  const { data: wallets, error: walletsError } = await supabase.from("wallets").select("user_id");
  if (walletsError) throw walletsError;

  let processed = 0;

  for (const w of wallets || []) {
    const uid = (w as { user_id?: string }).user_id;
    if (!uid) continue;

    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from("transactions_ledger")
      .select("amount")
      .eq("user_id", uid);

    if (ledgerErr) {
      console.error(`Ledger fetch error for user ${uid}:`, ledgerErr);
      continue;
    }

    const computedBalance = (ledgerRows || []).reduce((sum: number, row: { amount?: number | string } | unknown) => sum + Number((row as { amount?: number | string }).amount || 0), 0);

    const { error: updateErr } = await supabase
      .from("wallets")
      .update({ balance: computedBalance })
      .eq("user_id", uid);

    if (updateErr) {
      console.error(`Failed to update wallet for ${uid}:`, updateErr);
      continue;
    }

    processed++;
  }

  console.log(`Wallet reconciliation completed. Total wallets processed: ${processed}`);
}

reconcileWallets()
  .then(() => console.log("Reconciliation finished successfully."))
  .catch((err) => console.error("Reconciliation failed:", err));
