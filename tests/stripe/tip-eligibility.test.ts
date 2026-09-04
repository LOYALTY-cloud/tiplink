import assert from "node:assert/strict";
import test from "node:test";
import { canStripeAccountAcceptTips } from "../../src/lib/stripe/tipEligibility";

test("allows tips while ordinary Stripe verification requirements are due", () => {
  assert.equal(canStripeAccountAcceptTips(true, "restricted"), true);
});

test("allows tips for a healthy Stripe account", () => {
  assert.equal(canStripeAccountAcceptTips(true, "safe"), true);
});

test("blocks tips for high-risk and disconnected Stripe accounts", () => {
  assert.equal(canStripeAccountAcceptTips(true, "high_risk"), false);
  assert.equal(canStripeAccountAcceptTips(true, "disconnected"), false);
});

test("blocks tips whenever Stripe has disabled charges", () => {
  assert.equal(canStripeAccountAcceptTips(false, "safe"), false);
  assert.equal(canStripeAccountAcceptTips(false, "restricted"), false);
});