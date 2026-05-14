import { supabaseAdmin } from "@/lib/supabase/admin";

export type LedgerEntryType =
  | "tip_received"
  | "tip_refunded"
  | "dispute"
  | "payout"
  | "payout_reversal"
  | "adjustment"
  | "withdrawal"
  | "withdrawal_express"
  | "withdrawal_reversal"
  | "deposit"
  | "fee"
  | "system"
  | "theme_purchase"
  | "theme_sale";

export interface LedgerEntry {
  user_id: string;
  type: LedgerEntryType;
  amount: number;
  reference_id?: string | null;
  meta?: Record<string, unknown>;
  // keep legacy field for compatibility
  metadata?: Record<string, unknown>;
  performed_by?: string | null;
  action?: string | null;
  reason?: string | null;
  status?: string | null;
}

export async function addLedgerEntry(entry: LedgerEntry) {
  // Atomic: insert ledger row + recalculate wallet balance in a single DB call.
  // Falls back to two-step if the atomic RPC doesn't exist yet.
  const payload = {
    p_user_id: entry.user_id,
    p_type: entry.type,
    p_amount: entry.amount,
    p_reference_id: entry.reference_id ?? null,
    p_meta: entry.meta ?? entry.metadata ?? {},
    p_status: entry.status ?? "completed",
  };

  const { data, error } = await supabaseAdmin.rpc("add_ledger_entry_atomic", payload);

  if (error) {
    // If RPC doesn't exist yet (e.g. migration not applied), fall back to legacy two-step.
    // PostgREST may return "does not exist" or "Could not find the function" depending on version.
    const isNotFound =
      error.message.includes("does not exist") ||
      error.message.includes("Could not find the function") ||
      (error as any).code === "PGRST202";
    if (isNotFound) {
      return addLedgerEntryLegacy(entry);
    }
    throw new Error(`Ledger insert failed: ${error.message}`);
  }

  return data ?? null;
}

/** Legacy two-step fallback (non-atomic). Remove after migration is applied. */
async function addLedgerEntryLegacy(entry: LedgerEntry) {
  const insertPayload = {
    user_id: entry.user_id,
    type: entry.type,
    amount: entry.amount,
    reference_id: entry.reference_id ?? null,
    meta: entry.meta ?? entry.metadata ?? {},
    status: entry.status ?? "completed",
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.from("transactions_ledger").insert(insertPayload).select().single();

  if (error) {
    throw new Error(`Ledger insert failed: ${error.message}`);
  }

  const { error: recalcError } = await supabaseAdmin.rpc("recalculate_wallet_balance", { p_user_id: entry.user_id });
  if (recalcError) {
    throw new Error(`Wallet recalculation failed: ${recalcError.message}`);
  }

  return data ?? null;
}

export default addLedgerEntry;
