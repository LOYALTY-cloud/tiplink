import {
  ANIMATION_LABELS,
  getAllowedAnimations,
  getAllowedEliteEffects,
  getAllowedImageMotions,
  getAllowedOverlays,
  getAllowedVideoMotions,
  IMAGE_MOTION_OPTIONS,
  VIDEO_MOTION_OPTIONS,
  ALL_OVERLAYS,
  normalizeEliteEffects,
} from "../../src/lib/animationAccess";
import { getAnimationTierError, getMotionTierError, getOverlayTierError } from "../../src/lib/themeAnimationValidation";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  PASS ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL ${msg}`);
  }
}

console.log("-- Theme Animation Access Tests (no-tier) --\n");

// ── All animation tier errors return null (no restrictions) ──────────────────
for (const animationType of Object.keys(ANIMATION_LABELS)) {
  assert(
    getAnimationTierError(animationType as keyof typeof ANIMATION_LABELS) === null,
    `No tier error for animation: ${animationType}`
  );
}

// All animations available
assert(getAllowedAnimations().length === Object.keys(ANIMATION_LABELS).length, "All animations available");

// ── All image motion tier errors return null ──────────────────────────────────
for (const motion of IMAGE_MOTION_OPTIONS) {
  assert(getMotionTierError(motion, "image") === null, `No tier error for image motion: ${motion}`);
}

// All video motion tier errors return null
for (const motion of VIDEO_MOTION_OPTIONS) {
  assert(getMotionTierError(motion, "video") === null, `No tier error for video motion: ${motion}`);
}

assert(getAllowedImageMotions().length === IMAGE_MOTION_OPTIONS.length, "getAllowedImageMotions returns all image motions");
assert(getAllowedVideoMotions().length === VIDEO_MOTION_OPTIONS.length, "getAllowedVideoMotions returns all video motions");

// ── All overlay tier errors return null ──────────────────────────────────────
for (const overlay of ALL_OVERLAYS) {
  assert(getOverlayTierError(overlay) === null, `No tier error for overlay: ${overlay}`);
}
assert(getOverlayTierError(null) === null, "null overlay → no error");
assert(getAllowedOverlays().length === ALL_OVERLAYS.length, "getAllowedOverlays returns all overlays");

// ── Elite effects always available ────────────────────────────────────────────
assert(getAllowedEliteEffects().length === 3, "All 3 elite effects available");
assert(
  normalizeEliteEffects(["fog", "fog", "dust", "depthBlur", "invalid"]).length === 1,
  "normalizeEliteEffects dedupes and caps at 1"
);

console.log(`\n-- Results: ${passed} passed, ${failed} failed --`);
process.exit(failed > 0 ? 1 : 0);
