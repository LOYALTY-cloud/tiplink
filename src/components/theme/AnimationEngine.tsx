"use client";

import type { LightingType, MotionType, OverlayType } from "@/lib/animationAccess";
import BaseMotion from "./motion/BaseMotion";
import CinematicOverlayStack from "./overlay/CinematicOverlayStack";

interface AnimationEngineConfig {
  background?: string;
  motion?: MotionType | null;
  overlay?: OverlayType | null;
  lighting?: LightingType | null;
  speed?: number;
  intensity?: number;
}

export default function AnimationEngine({ config }: { config: AnimationEngineConfig }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <BaseMotion type={config.motion} image={config.background || ""} speed={config.speed} />
      <CinematicOverlayStack
        overlay={config.overlay}
        lighting={config.lighting}
        intensity={config.intensity}
        speed={config.speed}
        flashTrigger={config.motion === "flashHit"}
      />
    </div>
  );
}
