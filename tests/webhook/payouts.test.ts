import crypto from "crypto";
import { handleStripeEvent } from "../../src/app/api/stripe/webhook/route";

function makeMockSupabase() {
  const events: Record<string, any> = {};
  const locks: Record<string, any> = {};
  const withdrawals: Record<string, any> = {};

  function makeWalletLockDeleteQuery() {
    const filters: Record<string, any> = {};
    let expiresAtLt: string | null = null;
    const query: any = {
      eq: (col: string, val: any) => {
        filters[col] = val;
        if (filters.user_id && filters.lock_type && !expiresAtLt) {
          for (const key of Object.keys(locks)) {
            const row = locks[key];
            if (row.user_id === filters.user_id && row.lock_type === filters.lock_type) {
              delete locks[key];
            }
          }
        }
        return query;
      },
      lt: (col: string, val: any) => {
        if (col === "expires_at") expiresAtLt = String(val);
        return query;
      },
      select: async () => {
        const deleted: Array<{ id: string }> = [];
        for (const key of Object.keys(locks)) {
          const row = locks[key];
          if (filters.user_id && row.user_id !== filters.user_id) continue;
          if (filters.lock_type && row.lock_type !== filters.lock_type) continue;
          if (expiresAtLt && !(row.expires_at < expiresAtLt)) continue;
          deleted.push({ id: row.id });
          delete locks[key];
        }
        return { data: deleted, error: null };
      },
    };
    return query;
  }

  return {
    from: (table: string) => {
      if (table === "stripe_webhook_events") {
        return {
          select: () => ({
            eq: (_col: string, val: any) => ({
              maybeSingle: async () => ({ data: events[String(val)] ? { id: String(val) } : null }),
            }),
          }),
          upsert: async (payload: any) => {
            events[payload.id] = payload;
            return { error: null };
          },
        };
      }

      if (table === "wallet_locks") {
        return {
          insert: (payload: any) => ({
            select: () => ({
              single: async () => {
                const key = `${payload.user_id}::${payload.lock_type}`;
                if (locks[key]) {
                  return { error: { message: "unique_violation" } } as any;
                }
                const id = `lock-${crypto.randomUUID()}`;
                locks[key] = { id, ...payload };
                return { data: { id } };
              },
            }),
          }),
          delete: () => makeWalletLockDeleteQuery(),
          select: () => ({
            eq: (col: string, val: any) => ({
              maybeSingle: async () => {
                if (col === "user_id") {
                  const keyPrefix = `${val}::`;
                  const key = Object.keys(locks).find((x) => x.startsWith(keyPrefix));
                  return { data: key ? locks[key] : null };
                }
                return { data: null };
              },
            }),
          }),
        };
      }

      if (table === "withdrawals") {
        return {
          update: (payload: any) => {
            const filters: Record<string, any> = {};
            const query: any = {
              eq: (col: string, val: any) => {
                filters[col] = val;
                return query;
              },
              // Thenable so `await ...eq().eq()` resolves properly
              then: (resolve: (v: any) => void, reject?: (e: any) => void) => {
                try {
                  const id = String(filters["id"] ?? "");
                  const statusGuard = filters["status"];
                  if (id && withdrawals[id]) {
                    if (!statusGuard || withdrawals[id].status === statusGuard) {
                      withdrawals[id] = { ...withdrawals[id], ...payload };
                    }
                  }
                  resolve({ data: null, error: null });
                } catch (e) {
                  reject?.(e);
                }
              },
            };
            return query;
          },
          insert: async (payload: any) => {
            const rows = Array.isArray(payload) ? payload : [payload];
            for (const row of rows) {
              const id = row.stripe_payout_id ?? `insert_${crypto.randomUUID()}`;
              withdrawals[id] = row;
            }
            return { data: null, error: null };
          },
        };
      }

      if (table === "transactions_ledger") {
        const state: any = {
          user_id: null,
          type: null,
          refs: [] as string[],
        };
        const query: any = {
          data: [{ id: "existing-reversal" }],
          error: null,
          select: () => query,
          eq: (col: string, val: any) => {
            state[col] = val;
            return query;
          },
          in: (_col: string, vals: string[]) => {
            state.refs = vals;
            return query;
          },
          limit: () => query,
        };
        return query;
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      };
    },
    rpc: async () => ({ data: null, error: null }),
    __seedWithdrawal: (id: string, row: any) => {
      withdrawals[id] = row;
    },
    __getWithdrawal: (id: string) => withdrawals[id],
  } as any;
}

async function testPayoutPaid() {
  const supabase = makeMockSupabase();
  const withdrawalId = `wd_${crypto.randomUUID()}`;
  const userId = crypto.randomUUID();

  supabase.__seedWithdrawal(withdrawalId, { id: withdrawalId, status: "pending" });

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.paid",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 1234,
        metadata: {
          user_id: userId,
          withdrawal_id: withdrawalId,
        },
      },
    },
  } as any;

  await handleStripeEvent(event, supabase, async () => null);

  const updated = supabase.__getWithdrawal(withdrawalId);
  if (updated?.status !== "paid") {
    throw new Error(`Expected withdrawal status 'paid', got '${String(updated?.status)}'`);
  }
}

async function testPayoutFailedIdempotentSkip() {
  const supabase = makeMockSupabase();
  const withdrawalId = `wd_${crypto.randomUUID()}`;
  const userId = crypto.randomUUID();

  supabase.__seedWithdrawal(withdrawalId, { id: withdrawalId, status: "pending" });

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.failed",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 5000,
        failure_message: "Bank rejected payout",
        metadata: {
          user_id: userId,
          withdrawal_id: withdrawalId,
        },
      },
    },
  } as any;

  await handleStripeEvent(event, supabase, async () => null);

  const updated = supabase.__getWithdrawal(withdrawalId);
  if (updated?.status !== "failed") {
    throw new Error(`Expected withdrawal status 'failed', got '${String(updated?.status)}'`);
  }
  if (!String(updated?.failure_reason ?? "").includes("Bank rejected payout")) {
    throw new Error("Expected failure_reason to contain webhook failure message");
  }
}

async function testPayoutCreatedAdvancesToProcessing() {
  const supabase = makeMockSupabase();
  const withdrawalId = `wd_${crypto.randomUUID()}`;
  const userId = crypto.randomUUID();

  supabase.__seedWithdrawal(withdrawalId, { id: withdrawalId, status: "pending" });

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.created",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 2000,
        metadata: { user_id: userId, withdrawal_id: withdrawalId },
      },
    },
  } as any;

  await handleStripeEvent(event, supabase, async () => null);

  const updated = supabase.__getWithdrawal(withdrawalId);
  if (updated?.status !== "processing") {
    throw new Error(`Expected withdrawal status 'processing', got '${String(updated?.status)}'`);
  }
}

async function testPayoutCreatedNoOpForNonPending() {
  // A withdrawal that is already 'paid' should NOT be downgraded by payout.created
  const supabase = makeMockSupabase();
  const withdrawalId = `wd_${crypto.randomUUID()}`;
  const userId = crypto.randomUUID();

  supabase.__seedWithdrawal(withdrawalId, { id: withdrawalId, status: "paid" });

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.created",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 2000,
        metadata: { user_id: userId, withdrawal_id: withdrawalId },
      },
    },
  } as any;

  await handleStripeEvent(event, supabase, async () => null);

  const updated = supabase.__getWithdrawal(withdrawalId);
  if (updated?.status !== "paid") {
    throw new Error(`Expected withdrawal status to remain 'paid', got '${String(updated?.status)}'`);
  }
}

async function testPayoutCreatedExpressNoOp() {
  // Express payouts have no withdrawal row — should complete without error
  const supabase = makeMockSupabase();

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.created",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 5000,
        metadata: {}, // no withdrawal_id or user_id
      },
    },
  } as any;

  // Should not throw
  await handleStripeEvent(event, supabase, async () => null);
}

async function testPayoutCanceledMarksCanceled() {
  const supabase = makeMockSupabase();
  const withdrawalId = `wd_${crypto.randomUUID()}`;
  const userId = crypto.randomUUID();

  supabase.__seedWithdrawal(withdrawalId, { id: withdrawalId, status: "processing" });

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.canceled",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 3000,
        status: "canceled",
        metadata: { user_id: userId, withdrawal_id: withdrawalId },
      },
    },
  } as any;

  await handleStripeEvent(event, supabase, async () => null);

  const updated = supabase.__getWithdrawal(withdrawalId);
  if (updated?.status !== "canceled") {
    throw new Error(`Expected withdrawal status 'canceled', got '${String(updated?.status)}'`);
  }
}

async function testPayoutCanceledExpressNoOp() {
  // Express-initiated canceled payout (no metadata) — should complete without error
  // and NOT debit the ledger (we only debit on payout.paid)
  const supabase = makeMockSupabase();

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.canceled",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 8000,
        status: "canceled",
        metadata: {}, // no user_id — Express-initiated
      },
    },
  } as any;

  await handleStripeEvent(event, supabase, async () => null);
}

async function testPayoutReconciliationCompleted() {
  // Should complete without error — informational event only
  const supabase = makeMockSupabase();

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payout.reconciliation_completed",
    data: {
      object: {
        id: `po_${crypto.randomUUID()}`,
        amount: 10000,
        status: "paid",
        metadata: {},
      },
    },
  } as any;

  await handleStripeEvent(event, supabase, async () => null);
}

async function run() {
  await testPayoutPaid();
  await testPayoutFailedIdempotentSkip();
  await testPayoutCreatedAdvancesToProcessing();
  await testPayoutCreatedNoOpForNonPending();
  await testPayoutCreatedExpressNoOp();
  await testPayoutCanceledMarksCanceled();
  await testPayoutCanceledExpressNoOp();
  await testPayoutReconciliationCompleted();
  console.log("Payout webhook tests OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
