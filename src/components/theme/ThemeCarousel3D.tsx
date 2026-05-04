"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Props = {
  src: string;          // video or image URL
  mediaType?: "video" | "image";
  poster?: string;
  speed?: number;       // 1–10 (same scale as other motions)
  className?: string;
};

const PANEL_COUNT = 7;
const RADIUS = 280; // px — distance of each panel from the center axis
const FRONT_DEPTH = 120; // px — front panel camera push
const PANEL_W = 240;
const PANEL_H = 400;

export default function ThemeCarousel3D({
  src,
  mediaType = "video",
  poster,
  speed = 5,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [rotation, setRotation] = useState(0);

  // Interval in ms: faster speed value = shorter interval
  const intervalMs = Math.max(1200, Math.round(4800 - speed * 340));
  const stepAngle = 360 / PANEL_COUNT;

  // Auto-rotate
  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => prev - stepAngle);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [stepAngle, intervalMs]);

  const activeIndex = ((Math.round(-rotation / stepAngle) % PANEL_COUNT) + PANEL_COUNT) % PANEL_COUNT;

  // Autoplay video
  useEffect(() => {
    if (mediaType !== "video" || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, [mediaType, src]);

  return (
    <div
      className={className ?? "absolute inset-0"}
      style={{
        perspective: "1400px",
        perspectiveOrigin: "50% 48%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
      }}
    >
      {/* Ambient glow behind the carousel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 48%, rgba(80,100,180,0.28) 0%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <motion.div
        animate={{ rotateY: rotation }}
        transition={{ duration: Math.max(0.6, 1.4 - speed * 0.06), ease: [0.32, 0.72, 0.28, 1] }}
        style={{
          transformStyle: "preserve-3d",
          width: `${PANEL_W}px`,
          height: `${PANEL_H}px`,
          position: "relative",
        }}
      >
        {Array.from({ length: PANEL_COUNT }).map((_, i) => {
          const angle = stepAngle * i;
          const normalizedAngle = ((angle + rotation) % 360 + 360) % 360;
          const distFromFront = Math.min(normalizedAngle, 360 - normalizedAngle);
          const depthFactor = Math.max(0, 1 - distFromFront / 180);
          const isFront = distFromFront < stepAngle * 0.5;
          const zBoost = FRONT_DEPTH * depthFactor;
          const panelScale = 0.82 + depthFactor * 0.33;
          const brightness = 0.5 + depthFactor * 0.7;
          const opacity = 0.48 + depthFactor * 0.52;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                width: `${PANEL_W}px`,
                height: `${PANEL_H}px`,
                left: 0,
                top: 0,
                borderRadius: "18px",
                overflow: "hidden",
                transform: `rotateY(${angle}deg) translateZ(${RADIUS + zBoost}px) scale(${panelScale})`,
                transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease, filter 0.4s ease",
                opacity,
                filter: `brightness(${brightness})`,
                cursor: "pointer",
              }}
              onClick={() => {
                // Snap clicked panel to front
                setRotation(-angle);
              }}
            >
              {/* Media */}
              {mediaType === "video" ? (
                <video
                  ref={i === 0 ? videoRef : undefined}
                  src={src}
                  poster={poster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <img
                  src={src}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}

              {/* Glassy edge border + glow */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "18px",
                  border: `1px solid rgba(255,255,255,${0.18 + depthFactor * 0.54})`,
                  boxShadow: isFront
                    ? "0 0 42px rgba(180,200,255,0.62), inset 0 0 20px rgba(255,255,255,0.09)"
                    : `0 0 ${10 + depthFactor * 14}px rgba(100,120,200,${0.15 + depthFactor * 0.15})`,
                  pointerEvents: "none",
                }}
              />

              {/* Top specular highlight (glass sheen) */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "38%",
                  borderRadius: "18px 18px 50% 50% / 18px 18px 28% 28%",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 100%)",
                  pointerEvents: "none",
                }}
              />
            </div>
          );
        })}
      </motion.div>

      {/* Panel dot indicators */}
      <div
        className="absolute pointer-events-none"
        style={{ bottom: "18px", left: 0, right: 0, display: "flex", justifyContent: "center", gap: "6px" }}
      >
        {Array.from({ length: PANEL_COUNT }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === activeIndex ? "16px" : "6px",
              height: "6px",
              borderRadius: "3px",
              background:
                i === activeIndex
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(255,255,255,0.28)",
              transition: "width 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
