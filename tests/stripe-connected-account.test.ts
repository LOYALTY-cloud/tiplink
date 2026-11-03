import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const helper = readFileSync(
  new URL("../src/lib/stripe/connectedAccountParams.ts", import.meta.url),
  "utf8"
);
const sessionRoute = readFileSync(
  new URL("../src/app/api/stripe/connect/session/route.ts", import.meta.url),
  "utf8"
);

test("connected accounts have no Stripe dashboard and the platform collects requirements", () => {
  assert.match(helper, /stripe_dashboard: \{ type: "none" \}/);
  assert.match(helper, /requirement_collection: "application"/);
  assert.match(helper, /losses: \{ payments: "application" \}/);
  assert.doesNotMatch(helper, /type: "express"/);
});

test("negative balances from refunds/disputes/fraud are auto-debited from the creator's bank", () => {
  assert.match(helper, /debit_negative_balances: true/);
});

test("connect session route creates accounts only through the shared helper", () => {
  const creates = sessionRoute.match(/stripe\.accounts\.create\(([^)]*\)?)\)/g) ?? [];
  assert.equal(creates.length, 2);
  for (const call of creates) assert.match(call, /connectedAccountParams\(email\)/);
  assert.doesNotMatch(sessionRoute, /type: "express"/);
});

test("Stripe user-authentication popup is disabled only for platform-collected accounts", async () => {
  const { connectSessionComponents } = await import("../src/lib/stripe/connectedAccountParams.ts");
  const onboarding = connectSessionComponents(false, true).account_onboarding;
  assert.equal(onboarding?.features?.disable_stripe_user_authentication, true);
  const manage = connectSessionComponents(true, true).account_management;
  assert.equal(manage?.features?.disable_stripe_user_authentication, true);
  // Legacy Express accounts: Stripe rejects the flag, so it must be omitted.
  const legacy = connectSessionComponents(false, false).account_onboarding;
  assert.equal(legacy?.features?.disable_stripe_user_authentication, undefined);
  assert.equal(legacy?.features?.external_account_collection, true);
});

test("session route picks the flag from the account's requirement_collection", () => {
  assert.match(sessionRoute, /requirement_collection === "application"/);
  assert.match(sessionRoute, /connectSessionComponents\(isManageMode, platformCollectsRequirements\)/);
});
