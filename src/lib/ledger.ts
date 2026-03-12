import { supabaseAdmin } from "@/lib/supabase/admin";

export type LedgerEntry = {
  user_id: string;
  type: string; // deposit | tip | withdrawal | fee | refund | card_charge
  amount: number;
  reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
  // Optional audit fields
  performed_by?: string | null;
  action?: string | null;
  reason?: string | null;
};

export async function addLedgerEntry(entry: LedgerEntry) {
  // Use DB-side function to atomically insert ledger row + audit log
  const params: Record<string, unknown> = {
    _user_id: entry.user_id,
    _type: entry.type,
    _amount: entry.amount,
    _reference_id: entry.reference_id ?? null,
    _metadata: entry.metadata ?? {},
    _performed_by: entry.performed_by ?? null,
    _action: entry.action ?? "insert",
    _reason: entry.reason ?? null,
  };

  const { data, error } = await supabaseAdmin.rpc(
    "insert_ledger_entry_with_audit",
    params
  );

  if (error) {
    console.error("Ledger RPC failed:", error);
    throw new Error("Failed to log transaction");
  }

  return data?.[0] ?? null;
}

export default addLedgerEntry;
