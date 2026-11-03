import {
  recoverLegacyDestinationDispute,
  reimburseRecoveredDisputeWin,
  type LegacyRecoveryDeps,
} from "../../src/lib/stripe/legacyDisputeRecovery";

const USER = "user-1";
const ACCOUNT = "acct_creator";
const PLATFORM = "acct_platform";

function makeDeps(opts: { destination?: string | null; alreadyRecovered?: boolean; profileAccount?: string; feeRow?: any } = {}) {
  const calls = {
    reversals: [] as any[],
    transfers: [] as any[],
    ledger: [] as any[],
    audits: [] as any[],
    notifications: [] as any[],
    emails: [] as any[],
  };

  const destination = opts.destination === undefined ? ACCOUNT : opts.destination;
  const stripe: any = {
    charges: {
      retrieve: async () => ({
        transfer: destination ? "tr_1" : null,
        transfer_data: destination ? { destination } : null,
      }),
    },
    transfers: {
      retrieve: async () => ({ id: "tr_1", amount: 2091, amount_reversed: 0 }),
      createReversal: async (id: string, params: any, options: any) => {
        calls.reversals.push({ id, params, options });
        return { id: "trr_1" };
      },
      create: async (params: any, options: any) => {
        calls.transfers.push({ params, options });
        return { id: "tr_fee" };
      },
    },
    disputes: { retrieve: async () => { throw new Error("should not refetch"); } },
    accounts: { retrieve: async () => ({ id: PLATFORM }) },
  };

  const supabase: any = {
    from: (table: string) => {
      if (table === "transactions_ledger") {
        const query: any = {
          select: () => query,
          eq: () => query,
          contains: () => query,
          maybeSingle: async () => ({
            data: opts.feeRow ?? (opts.alreadyRecovered ? { id: "fee-row", meta: {} } : null),
          }),
        };
        return query;
      }
      if (table === "profiles") {
        const query: any = {
          select: () => query,
          eq: () => query,
          single: async () => ({
            data: { display_name: "Creator", handle: "creator", email: "c@example.com", stripe_account_id: opts.profileAccount ?? ACCOUNT },
            error: null,
          }),
        };
        return query;
      }
      if (table === "admin_actions") {
        return { insert: async (row: any) => { calls.audits.push(row); return { error: null }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const deps: LegacyRecoveryDeps = {
    stripe,
    supabase,
    ledgerFn: async (entry) => { calls.ledger.push(entry); return null; },
    sendEmail: (async (params: any) => { calls.emails.push(params); return { success: true }; }) as any,
    createNotification: (async (params: any) => { calls.notifications.push(params); }) as any,
    platformAccountId: PLATFORM,
  };
  return { deps, calls };
}

const dispute = (balanceTransactions: any[] = [{ amount: -2091, fee: 1500 }]) =>
  ({ id: "du_1", amount: 2091, charge: "ch_1", balance_transactions: balanceTransactions }) as any;
const tip = { receipt_id: "11111111-2222-3333-4444-555555555555", creator_user_id: USER };

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function testRecoversLegacyDestinationCharge() {
  const { deps, calls } = makeDeps();
  const result = await recoverLegacyDestinationDispute(deps, { dispute: dispute(), eventAccount: null, eventId: "evt_1", tip });
  assert(result.status === "recovered", `expected recovered, got ${JSON.stringify(result)}`);
  assert(calls.reversals.length === 1 && calls.reversals[0].params.amount === 2091, "principal reversal missing");
  assert(calls.reversals[0].options.idempotencyKey === "recover-principal-du_1", "reversal idempotency key");
  assert(calls.transfers.length === 1 && calls.transfers[0].params.amount === 1500, "fee transfer missing");
  assert(calls.transfers[0].params.destination === PLATFORM && calls.transfers[0].options.stripeAccount === ACCOUNT, "fee transfer direction");
  assert(calls.ledger.length === 1 && calls.ledger[0].amount === -15 && calls.ledger[0].meta.action === "dispute_fee_recovery", "fee ledger row");
  assert(calls.audits.length === 1 && calls.notifications.length === 1 && calls.emails.length === 1, "audit/notification/email");
}

async function testSkipsDisputesOnConnectedAccount() {
  const { deps, calls } = makeDeps();
  const result = await recoverLegacyDestinationDispute(deps, { dispute: dispute(), eventAccount: ACCOUNT, eventId: "evt_1", tip });
  assert(result.status === "skipped" && calls.reversals.length === 0 && calls.transfers.length === 0, "connected-account dispute must not move money");
}

async function testSkipsDirectCharges() {
  const { deps, calls } = makeDeps({ destination: null });
  const result = await recoverLegacyDestinationDispute(deps, { dispute: dispute(), eventAccount: null, eventId: "evt_1", tip });
  assert(result.status === "skipped" && calls.transfers.length === 0, "non-destination charge must not move money");
}

async function testSkipsInquiryWithoutWithdrawal() {
  const { deps, calls } = makeDeps();
  const result = await recoverLegacyDestinationDispute(deps, { dispute: dispute([]), eventAccount: null, eventId: "evt_1", tip });
  assert(result.status === "skipped" && calls.transfers.length === 0, "inquiry must not move money");
}

async function testSkipsAlreadyRecovered() {
  const { deps, calls } = makeDeps({ alreadyRecovered: true });
  const result = await recoverLegacyDestinationDispute(deps, { dispute: dispute(), eventAccount: null, eventId: "evt_1", tip });
  assert(result.status === "skipped" && calls.reversals.length === 0, "already recovered must be skipped");
}

async function testRejectsAccountMismatch() {
  const { deps, calls } = makeDeps({ profileAccount: "acct_other" });
  let threw = false;
  try {
    await recoverLegacyDestinationDispute(deps, { dispute: dispute(), eventAccount: null, eventId: "evt_1", tip });
  } catch {
    threw = true;
  }
  assert(threw && calls.reversals.length === 0 && calls.transfers.length === 0, "account mismatch must abort before moving money");
}

async function testReimbursesWonDispute() {
  const { deps, calls } = makeDeps({ feeRow: { id: "fee-row", meta: { principal_already_debited: 20.91, stripe_dispute_fee: 15 } } });
  const result = await reimburseRecoveredDisputeWin(deps, { dispute: dispute(), tip });
  assert(result.status === "reimbursed", `expected reimbursed, got ${JSON.stringify(result)}`);
  assert(calls.transfers[0].params.amount === 2091 && calls.transfers[0].params.destination === ACCOUNT, "reimbursement transfer");
  assert(calls.transfers[0].options.idempotencyKey === "reimburse-dispute-won-du_1", "reimbursement idempotency key");
}

async function testWonWithoutRecoveryIsNoop() {
  const { deps, calls } = makeDeps();
  const result = await reimburseRecoveredDisputeWin(deps, { dispute: dispute(), tip });
  assert(result.status === "skipped" && calls.transfers.length === 0, "unrecovered win must not move money");
}

async function main() {
  await testRecoversLegacyDestinationCharge();
  await testSkipsDisputesOnConnectedAccount();
  await testSkipsDirectCharges();
  await testSkipsInquiryWithoutWithdrawal();
  await testSkipsAlreadyRecovered();
  await testRejectsAccountMismatch();
  await testReimbursesWonDispute();
  await testWonWithoutRecoveryIsNoop();
  console.log("legacy dispute recovery tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
