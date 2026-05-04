import assert from "assert";
import { canCreatorAcceptTips, blockedReason } from "../src/lib/payouts.js";

function run() {
  // Creator with charges enabled
  assert.strictEqual(canCreatorAcceptTips({ stripe_charges_enabled: true }), true);

  // Creator without charges enabled
  assert.strictEqual(canCreatorAcceptTips({ stripe_charges_enabled: false }), false);

  // No profile
  assert.strictEqual(canCreatorAcceptTips(null), false);

  // blockedReason checks
  assert.strictEqual(blockedReason(null), "no_profile");
  assert.strictEqual(blockedReason({}), "no_account");
  assert.strictEqual(blockedReason({ stripe_account_id: "acc_123" }), "onboarding_incomplete");
  assert.strictEqual(
    blockedReason({ stripe_account_id: "a", stripe_onboarding_complete: true, stripe_charges_enabled: false }),
    "charges_disabled"
  );

  console.log("guard tests OK");
}

try {
  run();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
