import crypto from "crypto";
import { handleStripeEvent } from "../../src/app/api/stripe/webhook/route";
import { acquireWalletLock, releaseWalletLock } from "../../src/lib/walletLocks";

// In-memory mock Supabase + ledger to simulate concurrency and verify locks
function makeMockSupabase(onRefundSlice?: (userId: string, amount: number) => void) {
  const intents: Record<string, any> = {};
  const events: Record<string, any> = {};
  const locks: Record<string, any> = {};
  const processedRefunds: Record<string, boolean> = {};

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
      if (table === "tip_intents") {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({ maybeSingle: async () => ({ data: intents[val] ?? null }) })
          }),
          update: (payload: any) => ({ eq: async (col: string, val: any) => { const id = val as string; const it = Object.values(intents).find((x:any)=>x.id===id); if (it) Object.assign(it, payload); return { data: null }; } }),
        };
      }

      if (table === "stripe_webhook_events") {
        return {
          select: () => ({ eq: (col: string, val: any) => ({ maybeSingle: async () => ({ data: events[val] ? { id: val } : null }) }) }),
          upsert: async (payload: any) => {
            events[payload.id] = payload;
            return { error: null };
          },
          insert: (payload: any) => ({ single: async () => { events[payload.id] = payload; return { data: payload }; } }),
        };
      }

      if (table === "processed_refunds") {
        return {
          select: () => ({
            eq: (_col: string, val: any) => ({ maybeSingle: async () => ({ data: processedRefunds[String(val)] ? { refund_id: String(val) } : null }) }),
          }),
        };
      }

      if (table === "wallet_locks") {
        return {
          insert: (payload: any) => {
            return {
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
            };
          },
          delete: () => makeWalletLockDeleteQuery(),
          select: () => ({
            eq: (col: string, val: any) => ({
              maybeSingle: async () => {
                if (col === "user_id") {
                  const keyPrefix = `${val}::`;
                  const k = Object.keys(locks).find((x) => x.startsWith(keyPrefix));
                  return { data: k ? locks[k] : null };
                }
                return { data: null };
              },
            }),
          }),
        };
      }

      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert: async () => ({ data: null }) };
    },
    rpc: async (fn: string, args: any) => {
      if (fn === "apply_refund_slice") {
        const tip = Object.values(intents).find((it: any) => it.id === args.p_tip_id) as any;
        if (!tip) return { error: { message: "tip_not_found" } };

        if (processedRefunds[args.p_refund_id]) {
          return { error: { message: "duplicate key value violates unique constraint processed_refunds_pkey", code: "23505" } };
        }

        processedRefunds[args.p_refund_id] = true;
        tip.refunded_amount = Number((Number(tip.refunded_amount ?? 0) + Number(args.p_amount)).toFixed(2));
        tip.refund_status = tip.refunded_amount >= Number(tip.tip_amount ?? tip.amount ?? 0) ? "full" : "partial";
        tip.processed_refund_ids = [...(tip.processed_refund_ids ?? []), args.p_refund_id];
        if (onRefundSlice) onRefundSlice(args.p_user_id, Number(args.p_amount));
        return { error: null };
      }
      return { data: null };
    },
    __seedTipIntent: (receipt: string, row: any) => { intents[receipt] = row; },
    __getTipByReceipt: (receipt: string) => intents[receipt],
  } as any;
}

async function run() {
  const balances: Record<string, number> = {};
  const mockSupabase = makeMockSupabase((userId: string, amount: number) => {
    balances[userId] = (balances[userId] || 0) - amount;
  });

  const user = crypto.randomUUID();
  const receipt = `r-${crypto.randomUUID()}`;

  // Seed a succeeded tip_intent of $50
  const tip = { id: `intent-${crypto.randomUUID()}`, creator_user_id: user, amount: 50, receipt_id: receipt, status: "succeeded" };
  mockSupabase.__seedTipIntent(receipt, tip);

  balances[user] = 100; // starting balance

  const ledger = async (entry: any) => {
    balances[entry.user_id] = (balances[entry.user_id] || 0) + Number(entry.amount);
  };

  // Withdrawal operation: acquires lock, debits $100, holds lock for short time, releases
  async function withdrawalOp() {
    const lock = await acquireWalletLock(mockSupabase, user, "withdrawal", 300);
    if (!lock.ok) throw new Error("failed to acquire lock for withdraw");
    try {
      await ledger({ user_id: user, type: "withdrawal", amount: -100, reference_id: `wd-${crypto.randomUUID()}` });
      // simulate work
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      await releaseWalletLock(mockSupabase, user, "withdrawal");
    }
  }

  // Refund event that will be processed via webhook
  const refundEvent = {
    id: `evt_${crypto.randomUUID()}`,
    type: "charge.refunded",
    data: { object: { id: `ch_${crypto.randomUUID()}`, metadata: { receipt_id: receipt }, currency: "usd", amount_refunded: 5000 } },
  } as any;

  // Start withdrawal and refund concurrently
  const w = withdrawalOp();
  // give withdrawal a tiny headstart
  await new Promise((r) => setTimeout(r, 20));
  // first attempt — expected to be skipped because lock held
  try {
    await handleStripeEvent(refundEvent, mockSupabase, ledger);
  } catch {
    // expected while withdrawal lock is held; Stripe retry should later succeed
  }

  // Wait for withdrawal to finish
  await w;

  // Retry webhook (Stripe will retry) — now lock free and should process
  await handleStripeEvent(refundEvent, mockSupabase, ledger);

  // Final balance should be 100 (start) -100 (withdrawal) -50 (refund) = -50
  const final = balances[user];
  if (final !== -50) {
    console.error("Unexpected final balance", final);
    process.exit(2);
  }

  console.log("Concurrent withdraw+refund test OK");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
