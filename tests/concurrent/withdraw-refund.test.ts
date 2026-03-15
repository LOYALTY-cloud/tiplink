import crypto from "crypto";
import { handleStripeEvent } from "../../src/app/api/stripe/webhook/route";
import { acquireWalletLock, releaseWalletLock } from "../../src/lib/walletLocks";

// In-memory mock Supabase + ledger to simulate concurrency and verify locks
function makeMockSupabase() {
  const intents: Record<string, any> = {};
  const events: Record<string, any> = {};
  const locks: Record<string, any> = {};

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
          insert: (payload: any) => ({ single: async () => { events[payload.id] = payload; return { data: payload }; } }),
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
          delete: () => ({
            eq: async (col: string, val: any) => {
              if (col === "user_id") {
                const userId = val as string;
                for (const k of Object.keys(locks)) {
                  if (k.startsWith(`${userId}::`)) delete locks[k];
                }
              } else if (col === "id") {
                for (const k of Object.keys(locks)) {
                  if (locks[k].id === val) delete locks[k];
                }
              }
              return { data: null };
            },
          }),
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
    rpc: async () => ({ data: null }),
    __seedTipIntent: (receipt: string, row: any) => { intents[receipt] = row; },
    __getTipByReceipt: (receipt: string) => intents[receipt],
  } as any;
}

async function run() {
  const mockSupabase = makeMockSupabase();

  const user = crypto.randomUUID();
  const receipt = `r-${crypto.randomUUID()}`;

  // Seed a succeeded tip_intent of $50
  const tip = { id: `intent-${crypto.randomUUID()}`, creator_user_id: user, amount: 50, receipt_id: receipt, status: "succeeded" };
  mockSupabase.__seedTipIntent(receipt, tip);

  // Simple in-memory ledger balance
  const balances: Record<string, number> = {};
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
  await handleStripeEvent(refundEvent, mockSupabase, ledger);

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
