/**
 * Animation Access Test
 *
 * Verifies that all animations, motions, and overlays are available
 * to all creators — there are no tier restrictions.
 */

import {
  getAllowedAnimations,
  getAllowedImageMotions,
  getAllowedVideoMotions,
  getAllowedOverlays,
  getAllowedLighting,
  ANIMATION_LABELS,
  IMAGE_MOTION_OPTIONS,
  VIDEO_MOTION_OPTIONS,
  ALL_OVERLAYS,
} from "../../src/lib/animationAccess";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  PASS ${msg}`); }
  else { failed++; console.error(`  FAIL ${msg}`); }
}

console.log("-- Animation Open Access Tests --\n");

assert(getAllowedAnimations().length === Object.keys(ANIMATION_LABELS).length, "All animations unlocked");
assert(getAllowedImageMotions().length === IMAGE_MOTION_OPTIONS.length, "All image motions unlocked");
assert(getAllowedVideoMotions().length === VIDEO_MOTION_OPTIONS.length, "All video motions unlocked");
assert(getAllowedOverlays().length === ALL_OVERLAYS.length, "All overlays unlocked");
assert(getAllowedLighting().length === 2, "Both lighting types unlocked");

console.log(`\n-- Results: ${passed} passed, ${failed} failed --`);
process.exit(failed > 0 ? 1 : 0);
