import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { addOneMonth, nextRenewalAfter } from "../src/lib/store/billingDates.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("addOneMonth clamps to the end of shorter months", () => {
  assert.equal(addOneMonth(new Date("2026-01-31T10:00:00Z")).toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(addOneMonth(new Date("2028-01-31T10:00:00Z")).toISOString(), "2028-02-29T10:00:00.000Z");
  assert.equal(addOneMonth(new Date("2026-12-15T00:00:00Z")).toISOString(), "2027-01-15T00:00:00.000Z");
});

test("nextRenewalAfter stays anchored to the previous renewal date", () => {
  const next = nextRenewalAfter(new Date("2026-11-01T01:00:00Z"), new Date("2026-11-02T01:00:00Z"));
  assert.equal(next.toISOString(), "2026-12-01T01:00:00.000Z");
});

test("nextRenewalAfter never returns a past date after a long lapse", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const next = nextRenewalAfter(new Date("2026-08-01T00:00:00Z"), now);
  assert.equal(next.toISOString(), "2026-12-20T12:00:00.000Z");
});

test("new accounts are collected with Account Debits, guarded by the available balance", () => {
  const src = read("../src/lib/stripe/debitConnectedAccount.ts");
  assert.match(src, /requirement_collection === "application" \? "account_debit" : "transfer_reversal"/);
  assert.match(src, /source: stripeAccountId/);
  assert.match(src, /availableCents < amountCents/);
  assert.match(src, /idempotencyKey/);
  // Legacy accounts keep the transfer-reversal helper.
  assert.match(src, /deductFromConnectedAccount\(stripeAccountId/);
});

test("a failed Stripe debit never charges the ledger for new accounts", () => {
  const src = read("../src/lib/store/balanceBilling.ts");
  assert.match(src, /if \(method === "account_debit"\) \{\s*return \{\s*ok: false/);
});

test("activation, recovery and renewal all charge through the shared helper", () => {
  for (const file of [
    "../src/app/api/store/subscribe/route.ts",
    "../src/app/api/store/switch-to-balance/route.ts",
    "../src/app/api/cron/store-balance-renewal/route.ts",
  ]) {
    const src = read(file);
    assert.match(src, /chargeStoreFromBalance\(/, file);
    assert.doesNotMatch(src, /deductFromConnectedAccount/, file);
  }
});

test("balance stores get a renewal date and the renewal job is scheduled before grace expiry", () => {
  assert.match(read("../src/app/api/store/subscribe/route.ts"), /renews_at: addOneMonth\(now\)/);
  const vercel = JSON.parse(read("../vercel.json")) as { crons: { path: string; schedule: string }[] };
  const renewal = vercel.crons.find((c) => c.path === "/api/cron/store-balance-renewal");
  const grace = vercel.crons.find((c) => c.path === "/api/cron/store-grace-expiry");
  assert.ok(renewal && grace);
  assert.equal(renewal.schedule, "0 1 * * *");
  assert.equal(grace.schedule, "0 2 * * *");
});

test("renewal job only bills balance stores that have a renewal date and no card subscription", () => {
  const src = read("../src/app/api/cron/store-balance-renewal/route.ts");
  assert.match(src, /\.eq\("billing_type", "balance"\)/);
  assert.match(src, /\.not\("renews_at", "is", null\)/);
  assert.match(src, /\.is\("stripe_subscription_id", null\)/);
  assert.match(src, /store-renewal-\$\{store\.id\}-\$\{store\.renews_at\}/);
});
