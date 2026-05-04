"use client";

import type { MotionType } from "@/lib/animationAccess";

interface BaseMotionProps {
  type: MotionType | null | undefined;
  image: string;
  speed?: number;
}

export default function BaseMotion({ type, image, speed = 5 }: BaseMotionProps) {
  if (type !== "bounce") return null;

  const styleBase = image
    ? {
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 35%, #0f3460 65%, #1a1a2e 100%)",
      };

  return <div className="absolute inset-0 bg-cover bg-center" style={styleBase} data-speed={speed} />;
}
