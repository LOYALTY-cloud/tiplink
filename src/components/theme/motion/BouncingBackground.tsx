"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue } from "framer-motion";

interface Props {
  image?: string;
  speed?: number; // 1–10, default 5
}

/**
 * DVD-logo style bouncing background.
 * The image (or gradient fallback) is 130% of the container so edges are
 * never exposed. A requestAnimationFrame loop drives real velocity + wall
 * collision, and a simple lerp applies squash/stretch on impact so the
 * motion feels physical rather than looping.
 */
export default function BouncingBackground({ image, speed = 5 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Framer motion values wired directly to the div transform – no re-renders
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // How far the oversized image can travel before its edge hits the boundary.
    // Image is 130% of container (15% overhang each side), so max offset = 15%
    const getMaxX = () => container.offsetWidth * 0.15;
    const getMaxY = () => container.offsetHeight * 0.15;

    // Velocity in px/ms — slightly off-ratio so it never locks into a
    // repetitive grid-aligned loop
    const baseSpeed = (speed / 5) * 0.09; // 0.09 px/ms at speed=5
    let vx = baseSpeed;
    let vy = baseSpeed * 0.71; // ~35° angle

    // Squash/stretch state — lerped toward target each frame
    let sqX = 1,
      sqXTarget = 1;
    let sqY = 1,
      sqYTarget = 1;
    const lerpSpeed = 0.18; // how fast squash returns to 1
    const returnSpeed = 0.06;

    let posX = 0;
    let posY = 0;
    let lastTime: number | null = null;
    let raf: number;

    const tick = (time: number) => {
      if (lastTime === null) {
        lastTime = time;
        raf = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min(time - lastTime, 50); // cap at 50ms to avoid jumps on tab-resume
      lastTime = time;

      posX += vx * dt;
      posY += vy * dt;

      const maxX = getMaxX();
      const maxY = getMaxY();

      // Wall collisions
      if (posX > maxX) {
        posX = maxX;
        vx = -Math.abs(vx);
        // Squash horizontally on vertical-wall hit
        sqXTarget = 1.13;
        sqYTarget = 0.89;
      } else if (posX < -maxX) {
        posX = -maxX;
        vx = Math.abs(vx);
        sqXTarget = 1.13;
        sqYTarget = 0.89;
      }

      if (posY > maxY) {
        posY = maxY;
        vy = -Math.abs(vy);
        // Squash vertically on horizontal-wall hit
        sqXTarget = 0.89;
        sqYTarget = 1.13;
      } else if (posY < -maxY) {
        posY = -maxY;
        vy = Math.abs(vy);
        sqXTarget = 0.89;
        sqYTarget = 1.13;
      }

      // Lerp squash toward target, then target back toward 1
      sqX += (sqXTarget - sqX) * lerpSpeed;
      sqY += (sqYTarget - sqY) * lerpSpeed;
      sqXTarget += (1 - sqXTarget) * returnSpeed;
      sqYTarget += (1 - sqYTarget) * returnSpeed;

      x.set(posX);
      y.set(posY);
      scaleX.set(sqX);
      scaleY.set(sqY);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, x, y, scaleX, scaleY]);

  const bgStyle: React.CSSProperties = image
    ? {
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background:
          "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
      };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
    >
      <motion.div
        style={{
          position: "absolute",
          width: "130%",
          height: "130%",
          top: "-15%",
          left: "-15%",
          x,
          y,
          scaleX,
          scaleY,
          ...bgStyle,
        }}
      />
    </div>
  );
}
