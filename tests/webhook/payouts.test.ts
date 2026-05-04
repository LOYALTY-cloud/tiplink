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
          update: (payload: any) => ({
            eq: async (_col: string, val: any) => {
              const id = String(val);
              withdrawals[id] = { ...(withdrawals[id] ?? {}), ...payload };
              return { data: null, error: null };
            },
          }),
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

async function run() {
  await testPayoutPaid();
  await testPayoutFailedIdempotentSkip();
  console.log("Payout webhook tests OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
