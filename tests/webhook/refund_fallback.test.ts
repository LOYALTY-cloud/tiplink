import crypto from "crypto";
import { handleStripeEvent } from "../../src/app/api/stripe/webhook/route";

let ledgerCalls = 0;
let lastLedger: any = null;
const mockLedger = async (args: any) => { ledgerCalls++; lastLedger = args; };

function makeMockSupabase() {
  const intents: Record<string, any> = {};
  const events: Record<string, any> = {};
  const locks: Record<string, any> = {};
  const processedRefunds: Record<string, boolean> = {};
  const ledger: any[] = [];

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
          insert: (payload: any) => ({ select: () => ({ single: async () => ({ data: payload }) }) }),
          update: (payload: any) => ({ eq: async (col: string, val: any) => { const id = val as string; const intent = Object.values(intents).find((it: any) => it.id === id); if (intent) Object.assign(intent, payload); return { data: null }; } }),
        };
      }

      if (table === "stripe_webhook_events") {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({ maybeSingle: async () => ({ data: events[val] ? { id: val } : null }) })
          }),
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
          insert: (payload: any) => ({ select: () => ({ single: async () => {
            const key = `${payload.user_id}::${payload.lock_type}`;
            if (locks[key]) {
              return { error: { message: "unique_violation" } } as any;
            }
            const id = `lock-${crypto.randomUUID()}`;
            locks[key] = { id, ...payload };
            return { data: { id } };
          } }) }),
          delete: () => makeWalletLockDeleteQuery(),
          select: () => ({ eq: async () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: async () => ({ data: null }),
      };
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
        ledger.push({ user_id: args.p_user_id, type: "tip_refunded", amount: -Number(args.p_amount), reference_id: args.p_refund_id });
        return { error: null };
      }
      return { data: null };
    },
    __seedTipIntent: (receipt: string, row: any) => { intents[receipt] = row; },
    __getTipByReceipt: (receipt: string) => intents[receipt],
    __getLedger: () => ledger,
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

  const ledger = mockSupabase.__getLedger();
  if (ledger.length !== 1) {
    console.error("Expected one refund ledger slice, got", ledger.length);
    process.exit(2);
  }

  if (ledger[0].type !== "tip_refunded" || ledger[0].amount !== -10) {
    console.error("Ledger entry incorrect", ledger[0]);
    process.exit(3);
  }

  console.log("Refund fallback test OK");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
