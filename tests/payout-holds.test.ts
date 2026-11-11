import { ensureManualPayoutSchedule } from "../src/lib/stripe/payoutSchedule";
import {
  humanizePayoutFailure,
  PAYOUT_REASON_ACCOUNT_RESTRICTED,
  PAYOUT_REASON_INSUFFICIENT_BALANCE,
} from "../src/lib/payoutErrors";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function fakeStripe(interval: string | undefined) {
  const updates: any[] = [];
  const stripe: any = {
    accounts: {
      retrieve: async () => ({ settings: { payouts: { schedule: interval ? { interval } : undefined } } }),
      update: async (id: string, params: any) => {
        updates.push({ id, params });
        return {};
      },
    },
  };
  return { stripe, updates };
}

async function testSwitchesAutomaticToManual() {
  for (const interval of ["daily", "weekly", "monthly"]) {
    const { stripe, updates } = fakeStripe(interval);
    const result = await ensureManualPayoutSchedule(stripe, "acct_1");
    assert(result.changed && result.previous === interval, `${interval}: expected change`);
    assert(updates.length === 1 && updates[0].params.settings.payouts.schedule.interval === "manual", `${interval}: update payload`);
  }
}

async function testManualIsLeftAlone() {
  const { stripe, updates } = fakeStripe("manual");
  const result = await ensureManualPayoutSchedule(stripe, "acct_1");
  assert(!result.changed && updates.length === 0, "manual schedule must not be updated");
}

function testReleaseFailureMessages() {
  const insufficient = humanizePayoutFailure(null, PAYOUT_REASON_INSUFFICIENT_BALANCE);
  assert(insufficient.includes("no longer in your Stripe balance"), "insufficient balance message");
  assert(!insufficient.includes("bank returned an error"), "must not read like a bank error");

  const restricted = humanizePayoutFailure(null, PAYOUT_REASON_ACCOUNT_RESTRICTED);
  assert(restricted.includes("restricted"), "restricted message");

  assert(humanizePayoutFailure("declined", null).includes("declined"), "stripe failure codes still map");
}

async function main() {
  await testSwitchesAutomaticToManual();
  await testManualIsLeftAlone();
  testReleaseFailureMessages();
  console.log("payout hold tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
