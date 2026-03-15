import crypto from "crypto";
import { handleStripeEvent } from "../../src/app/api/stripe/webhook/route";

// Simple in-memory mocks for Supabase and ledger helper.
let ledgerCalls = 0;
const mockLedger = async () => { ledgerCalls++; };

function makeMockSupabase() {
  const intents: Record<string, any> = {};
  const events: Record<string, any> = {};
  const locks: Record<string, any> = {};

  return {
    from: (table: string) => {
      if (table === "tip_intents") {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({ maybeSingle: async () => {
              if (col === "receipt_id") {
                const receipt = val as string;
                return { data: intents[receipt] ?? null };
              }
              return { data: null };
            } })
          }),
          insert: (payload: any) => ({ select: () => ({ single: async () => ({ data: payload }) }) }),
          update: (payload: any) => ({ eq: async (col: string, val: any) => {
            // apply update to stored intent
            const id = val as string;
            const intent = Object.values(intents).find((it: any) => it.id === id);
            if (intent) Object.assign(intent, payload);
            return { data: null };
          } }),
        };
      }

      if (table === "stripe_webhook_events") {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({ maybeSingle: async () => {
              if (col === "id") {
                const id = val as string;
                return { data: events[id] ? { id } : null };
              }
              return { data: null };
            } })
          }),
          insert: (payload: any) => ({ single: async () => { events[payload.id] = payload; return { data: payload }; } }),
        };
      }

      if (table === "wallet_locks") {
        return {
          insert: (payload: any) => ({ select: () => ({ single: async () => {
            const key = `${payload.user_id}::${payload.lock_type}`;
            if (locks[key]) {
              return { error: { message: "unique_violation" } } as any;
            }
            const id = `lock-${crypto.randomUUID()}`;
            locks[key] = { id, ...payload };
            return { data: { id } };
          } }) }),
          delete: () => ({ eq: async (col: string, val: any) => { // delete by user_id or id
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
          } }),
          select: () => ({
            eq: (col: string, val: any) => ({ maybeSingle: async () => {
              if (col === "user_id") {
                const keyPrefix = `${val}::`;
                const k = Object.keys(locks).find((x) => x.startsWith(keyPrefix));
                return { data: k ? locks[k] : null };
              }
              return { data: null };
            } })
          }),
        };
      }

      // generic fallback for other tables
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: async () => ({ data: null }),
      };
    },
    rpc: async () => ({ data: null }),
    // helpers for test to seed/fetch
    __seedTipIntent: (receipt: string, row: any) => { intents[receipt] = row; },
    __getTipByReceipt: (receipt: string) => intents[receipt],
  } as any;
}

async function run() {
  const mockSupabase: any = makeMockSupabase();

  const creator = crypto.randomUUID();
  const receiptId = `test-${crypto.randomUUID()}`;

  // Seed a pending tip_intent
  const intent = { id: `intent-${crypto.randomUUID()}`, creator_user_id: creator, amount: 1.23, receipt_id: receiptId, status: "pending" };
  mockSupabase.__seedTipIntent(receiptId, intent);

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: `pi_${crypto.randomUUID()}`,
        metadata: { receipt_id: receiptId },
        currency: "usd",
        amount: 123,
      },
    },
  } as any;

  // Call handler twice to simulate duplicate webhook deliveries
  await handleStripeEvent(event, mockSupabase, async () => { ledgerCalls++; });
  await handleStripeEvent(event, mockSupabase, async () => { ledgerCalls++; });

  // Assertions
  if (ledgerCalls !== 1) {
    console.error("Expected ledger to be called exactly once, got", ledgerCalls);
    process.exit(2);
  }

  console.log("Mocked webhook test OK");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
