import assert from "node:assert/strict";
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