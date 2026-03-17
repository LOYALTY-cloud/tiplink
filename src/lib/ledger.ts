import { supabaseAdmin } from "@/lib/supabase/admin";

export type LedgerEntryType =
  | "tip_received"
  | "tip_refunded"
  | "payout"
  | "card_charge"
  | "card_refund"
  | "adjustment"
  | "withdrawal"
  | "deposit"
  | "fee"
  | "card_reversal"
  | "system";

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
  // Insert a canonical ledger row
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

  // Recalculate wallet balance for the user (DB-side logic)
  const { error: recalcError } = await supabaseAdmin.rpc("recalculate_wallet_balance", { p_user_id: entry.user_id });
  if (recalcError) {
    throw new Error(`Wallet recalculation failed: ${recalcError.message}`);
  }

  return data ?? null;
}

export default addLedgerEntry;
