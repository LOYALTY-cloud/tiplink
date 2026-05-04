import crypto from "crypto";
import { reversePayoutOnce } from "../../src/lib/payoutReversals";

function makeMockSupabase(existingRows: Array<{ id: string }> = []) {
  const state = {
    existing: existingRows,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    lastQuery: {
      user_id: "",
      type: "",
      refs: [] as string[],
    },
  };

  const ledgerQuery: any = {
    data: state.existing,
    error: null,
    select: () => ledgerQuery,
    eq: (col: string, val: any) => {
      if (col === "user_id") state.lastQuery.user_id = String(val);
      if (col === "type") state.lastQuery.type = String(val);
      return ledgerQuery;
    },
    in: (_col: string, vals: string[]) => {
      state.lastQuery.refs = vals;
      return ledgerQuery;
    },
    limit: () => {
      ledgerQuery.data = state.existing;
      ledgerQuery.error = null;
      return ledgerQuery;
    },
  };

  const supabase: any = {
    from: (table: string) => {
      if (table === "transactions_ledger") return ledgerQuery;
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
    __state: state,
  };

  return supabase;
}

async function testSkipsWhenAlreadyReversed() {
  const supabase = makeMockSupabase([{ id: "existing-reversal" }]);
  const writes: any[] = [];

  const result = await reversePayoutOnce({
    supabase,
    userId: crypto.randomUUID(),
    amount: 12.34,
    withdrawalId: `wd_${crypto.randomUUID()}`,
    reason: "payout_failed",
    action: "payout_failed_reversal",
    addLedgerEntryFn: async (entry: any) => {
      writes.push(entry);
      return null as any;
    },
  });

  if (!result.skipped || result.reversed) {
    throw new Error("Expected skip=true and reversed=false when reversal already exists");
  }
  if (writes.length !== 0) {
    throw new Error("Expected no ledger writes when reversal already exists");
  }
  if (supabase.__state.rpcCalls.length !== 0) {
    throw new Error("Expected no decrement_daily_withdrawn call when skipped");
  }
}

async function testReversesWhenNoExistingReversal() {
  const supabase = makeMockSupabase([]);
  const writes: any[] = [];
  const userId = crypto.randomUUID();
  const withdrawalId = `wd_${crypto.randomUUID()}`;

  const result = await reversePayoutOnce({
    supabase,
    userId,
    amount: 50,
    withdrawalId,
    payoutId: `po_${crypto.randomUUID()}`,
    reason: "Bank rejected payout",
    action: "payout_failed_reversal",
    eventId: `evt_${crypto.randomUUID()}`,
    addLedgerEntryFn: async (entry: any) => {
      writes.push(entry);
      return null as any;
    },
  });

  if (!result.reversed || result.skipped) {
    throw new Error("Expected reversed=true and skipped=false when no reversal exists");
  }
  if (writes.length !== 1) {
    throw new Error(`Expected exactly 1 ledger write, got ${writes.length}`);
  }

  const entry = writes[0];
  if (entry.type !== "payout_reversal" || entry.user_id !== userId || entry.amount !== 50) {
    throw new Error(`Unexpected ledger entry payload: ${JSON.stringify(entry)}`);
  }
  if (entry.reference_id !== withdrawalId) {
    throw new Error("Expected withdrawal ID to be used as reference_id");
  }

  if (supabase.__state.rpcCalls.length !== 1) {
    throw new Error("Expected decrement_daily_withdrawn to be called exactly once");
  }
  const rpc = supabase.__state.rpcCalls[0];
  if (rpc.fn !== "decrement_daily_withdrawn") {
    throw new Error(`Unexpected rpc call: ${rpc.fn}`);
  }
}

async function run() {
  await testSkipsWhenAlreadyReversed();
  await testReversesWhenNoExistingReversal();
  console.log("Payout reversal tests OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
