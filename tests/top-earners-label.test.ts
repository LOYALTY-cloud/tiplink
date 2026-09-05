import assert from "node:assert/strict";
import test from "node:test";
import { getDisplayHandle } from "../src/lib/profileHandle";

test("top earners use display name when handle is a UUID placeholder", () => {
  const profile = {
    handle: getDisplayHandle("7e2894d4-6dcf-4a58-9141-4a71d654fec9"),
    display_name: "Lee Paris",
  };

  assert.equal(profile.handle, null);
  assert.equal(profile.display_name, "Lee Paris");
});

test("top earners preserve a valid handle", () => {
  assert.equal(getDisplayHandle("leeparis"), "leeparis");
});