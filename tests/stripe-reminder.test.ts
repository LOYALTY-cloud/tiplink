import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../src/app/api/admin/users/[userId]/stripe-reminder/route.ts", import.meta.url),
  "utf8"
);

test("rejected Stripe accounts use Account Settings instead of an impossible account link", () => {
  assert.match(route, /const rejected = profile\.stripe_disabled_reason\?\.startsWith\("rejected\."\)/);
  assert.match(route, /let onboardingUrl = `\$\{APP_URL\}\/dashboard\/account`/);
  assert.match(route, /if \(!rejected\)/);
});