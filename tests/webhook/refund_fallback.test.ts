import crypto from "crypto";
import { handleStripeEvent } from "../../src/app/api/stripe/webhook/route";

let ledgerCalls = 0;
let lastLedger: any = null;
const mockLedger = async (args: any) => { ledgerCalls++; lastLedger = args; };

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
          insert: (payload: any) => ({ select: () => ({ single: async () => ({ data: payload }) }) }),
          update: (payload: any) => ({ eq: async (col: string, val: any) => { const id = val as string; const intent = Object.values(intents).find((it: any) => it.id === id); if (intent) Object.assign(intent, payload); return { data: null }; } }),
        };
      }

      if (table === "stripe_webhook_events") {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({ maybeSingle: async () => ({ data: events[val] ? { id: val } : null }) })
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
          delete: () => ({ eq: async () => ({ data: null }) }),
          select: () => ({ eq: async () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: async () => ({ data: null }),
      };
    },
    rpc: async () => ({ data: null }),
    __seedTipIntent: (receipt: string, row: any) => { intents[receipt] = row; },
    __getTipByReceipt: (receipt: string) => intents[receipt],
  } as any;
}

async function run() {
  const mockSupabase: any = makeMockSupabase();

  const creator = crypto.randomUUID();
  const receiptId = `test-${crypto.randomUUID()}`;

  const intent = { id: `intent-${crypto.randomUUID()}`, creator_user_id: creator, amount: 10, tip_amount: null, receipt_id: receiptId, status: "succeeded" };
  mockSupabase.__seedTipIntent(receiptId, intent);

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${crypto.randomUUID()}`,
        metadata: { receipt_id: receiptId },
        currency: "usd",
        amount_refunded: 1000,
      },
    },
  } as any;

  await handleStripeEvent(event, mockSupabase, mockLedger);

  if (ledgerCalls !== 1) {
    console.error("Expected ledger to be called exactly once, got", ledgerCalls);
    process.exit(2);
  }

  if (!lastLedger || lastLedger.type !== "tip_refunded" || lastLedger.amount !== -10) {
    console.error("Ledger entry incorrect", lastLedger);
    process.exit(3);
  }

  console.log("Refund fallback test OK");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
