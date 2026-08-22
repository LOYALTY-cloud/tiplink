import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldRestrictPlatformAccount,
  wasStripeAccountEverFullyEnabled,
} from "../../src/lib/stripe/accountRestriction";

test("does not restrict a creator who has only submitted onboarding details", () => {
  const wasEverFullyEnabled = wasStripeAccountEverFullyEnabled(null, false);

  assert.equal(shouldRestrictPlatformAccount(wasEverFullyEnabled, "high_risk"), false);
});

test("restricts a previously enabled Stripe account that later becomes disabled", () => {
  const wasEverFullyEnabled = wasStripeAccountEverFullyEnabled("2026-08-01T00:00:00.000Z", false);

  assert.equal(shouldRestrictPlatformAccount(wasEverFullyEnabled, "restricted"), true);
});

test("recognizes first-time enablement during the current sync", () => {
  const wasEverFullyEnabled = wasStripeAccountEverFullyEnabled(null, true);

  assert.equal(wasEverFullyEnabled, true);
  assert.equal(shouldRestrictPlatformAccount(wasEverFullyEnabled, "healthy"), false);
});