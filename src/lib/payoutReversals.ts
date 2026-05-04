import type { SupabaseClient } from "@supabase/supabase-js";
import { addLedgerEntry } from "@/lib/ledger";

type ReversePayoutOnceInput = {
  supabase: SupabaseClient;
  userId: string;
  amount: number;
  withdrawalId?: string | null;
  payoutId?: string | null;
  reason: string;
  action: string;
  eventId?: string | null;
  extraMeta?: Record<string, unknown>;
  addLedgerEntryFn?: typeof addLedgerEntry;
};

type ReversePayoutOnceResult = {
  reversed: boolean;
  skipped: boolean;
};

export async function reversePayoutOnce({
  supabase,
  userId,
  amount,
  withdrawalId,
  payoutId,
  reason,
  action,
  eventId,
  extraMeta,
  addLedgerEntryFn,
}: ReversePayoutOnceInput): Promise<ReversePayoutOnceResult> {
  const refs = [...new Set([withdrawalId, payoutId].filter(Boolean))] as string[];
  const referenceId = withdrawalId ?? payoutId ?? null;

  if (!referenceId) {
    throw new Error("Payout reversal requires withdrawalId or payoutId");
  }

  let existingQuery = supabase
    .from("transactions_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "payout_reversal")
    .limit(1);

  existingQuery = refs.length === 1
    ? existingQuery.eq("reference_id", refs[0])
    : existingQuery.in("reference_id", refs);

  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) {
    throw new Error(`Failed to check payout reversal state: ${existingError.message}`);
  }
  if (existing && existing.length > 0) {
    return { reversed: false, skipped: true };
  }

  const writeLedger = addLedgerEntryFn ?? addLedgerEntry;

  await writeLedger({
    user_id: userId,
    type: "payout_reversal",
    amount: Number(amount.toFixed(2)),
    reference_id: referenceId,
    meta: {
      action,
      reason,
      original_withdrawal_id: withdrawalId ?? null,
      original_payout_id: payoutId ?? null,
      ...(eventId ? { event_id: eventId } : {}),
      ...(extraMeta ?? {}),
    },
    status: "completed",
  });

  try {
    await supabase.rpc("decrement_daily_withdrawn", {
      uid: userId,
      amt: Number(amount.toFixed(2)),
    });
  } catch {
    // Non-blocking: the balance reversal is the source of truth.
  }

  return { reversed: true, skipped: false };
}