import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDisplayHandle } from "../src/lib/profileHandle";

test("hides UUID placeholder handles", () => {
  assert.equal(getDisplayHandle("7d708b95-a51c-49b4-bf22-90a89c5410f5"), null);
  assert.equal(getDisplayHandle("7D708B95-A51C-49B4-BF22-90A89C5410F5"), null);
});

test("preserves real handles", () => {
  assert.equal(getDisplayHandle("  blacgurt  "), "blacgurt");
});

test("treats empty handles as missing", () => {
  assert.equal(getDisplayHandle(null), null);
  assert.equal(getDisplayHandle("   "), null);
});

test("Stripe onboarding never replaces a chosen handle with the user ID", () => {
  const route = readFileSync(
    new URL("../src/app/api/stripe/connect/session/route.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(route, /handle\s*:\s*user_id/);
});