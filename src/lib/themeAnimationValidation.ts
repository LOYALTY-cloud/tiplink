import type { AnimationType, MotionType, OverlayType } from "@/lib/animationAccess";

export function getAnimationTierError(
  _animationType: AnimationType | null | undefined,
  _tier?: string | null
): string | null {
  return null;
}

export function getMotionTierError(
  _motion: MotionType | null | undefined,
  _tier?: string | null,
  _backgroundMediaType?: "image" | "video"
): string | null {
  return null;
}

export function getOverlayTierError(
  _overlay: OverlayType | null | undefined,
  _tier?: string | null
): string | null {
  return null;
}
