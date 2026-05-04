"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { LightingType, OverlayType } from "@/lib/animationAccess";
import LightRainOverlay from "./LightRainOverlay";
import SmokeOverlay from "./SmokeOverlay";
import FireOverlay from "./FireOverlay";

interface Props {
  overlay?: OverlayType | null;
  lighting?: LightingType | null;
  intensity?: number;
  speed?: number;
  rainStyle?: "soft" | "storm" | "luxury";
  fireStyle?: "embers" | "flameEdge" | "sparks";
  flashTrigger?: boolean;
  cameraPos?: { x: number; y: number };
}

export default function CinematicOverlayStack({
  overlay,
  lighting,
  intensity = 5,
  speed = 5,
  rainStyle = "soft",
  fireStyle = "embers",
  flashTrigger = false,
  cameraPos = { x: 0, y: 0 },
}: Props) {
  const [flashOn, setFlashOn] = useState(false);

  const clampedIntensity = useMemo(() => Math.min(10, Math.max(1, intensity)), [intensity]);
  const clampedSpeed = useMemo(() => Math.min(10, Math.max(1, speed)), [speed]);

  // useEffect must come before any conditional return to satisfy rules of hooks
  useEffect(() => {
    if (!flashTrigger) return;
    setFlashOn(true);
    const timer = window.setTimeout(() => setFlashOn(false), 220);
    return () => window.clearTimeout(timer);
  }, [flashTrigger]);

  const hasOverlay = Boolean(overlay || lighting);
  if (!hasOverlay && !flashTrigger) return null;

  const gradientOpacity = 0.08 + (clampedIntensity / 10) * 0.12;
  const supportOpacity = 0.05 + (clampedIntensity / 10) * 0.1;
  const vignetteMin = 0.3 + (clampedIntensity / 10) * 0.05;
  const vignetteMax = vignetteMin + 0.14;
  const sweepDuration = Math.max(2.8, 4.5 - clampedSpeed * 0.18);
  const motionEnergy = Math.min(1, Math.abs(cameraPos.x) + Math.abs(cameraPos.y));

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute inset-0 mix-blend-overlay"
        animate={{
          background: [
            "linear-gradient(135deg, rgba(64,120,255,0.32), rgba(0,210,255,0.28))",
            "linear-gradient(215deg, rgba(36,255,178,0.28), rgba(255,94,214,0.27))",
            "linear-gradient(135deg, rgba(64,120,255,0.32), rgba(0,210,255,0.28))",
          ],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        style={{ opacity: gradientOpacity }}
      />

      {overlay === "dust" && (
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "34px 34px, 52px 52px",
            backgroundPosition: "0 0, 12px 18px",
            opacity: supportOpacity,
          }}
          animate={{ backgroundPosition: ["0px 0px, 12px 18px", "220px 160px, -120px 140px"] }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        />
      )}

      {overlay === "sparkle" && (
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.95) 1.2px, transparent 1.4px), radial-gradient(rgba(255,255,255,0.65) 0.9px, transparent 1.1px)",
            backgroundSize: "42px 42px, 68px 68px",
            backgroundPosition: "0 0, 14px 20px",
            opacity: supportOpacity,
          }}
          animate={{ backgroundPosition: ["0px 0px, 14px 20px", "150px 140px, -90px 80px"] }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
        />
      )}

      {overlay === "lightRain" && (
        <LightRainOverlay intensity={clampedIntensity} speed={clampedSpeed} rainStyle={rainStyle} />
      )}

      {overlay === "smoke" && (
        <SmokeOverlay intensity={clampedIntensity} speed={clampedSpeed} />
      )}

      {overlay === "fire" && (
        <FireOverlay intensity={clampedIntensity} speed={clampedSpeed} cameraPos={cameraPos} fireStyle={fireStyle} />
      )}

      {lighting === "sweep" && (
        <motion.div
          className="absolute inset-0"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: sweepDuration, repeat: Infinity, ease: "linear" }}
          style={{
            background:
              "linear-gradient(120deg, transparent, rgba(255,255,255,0.25), transparent)",
            opacity: 0.22 + (clampedIntensity / 10) * 0.1,
          }}
        />
      )}

      {lighting === "glow" && (
        <motion.div
          className="absolute inset-0 blur-2xl"
          style={{
            background:
              "radial-gradient(circle at 46% 46%, rgba(0,255,200,0.32), transparent 58%)",
            opacity: 0.14 + (clampedIntensity / 10) * 0.12,
          }}
          animate={{ opacity: [0.16, 0.26, 0.16], scale: [1, 1.02, 1] }}
          transition={{ duration: Math.max(4.5, 8 - clampedSpeed * 0.35), repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [vignetteMin, vignetteMax, vignetteMin] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(circle, transparent 50%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <AnimatePresence>
        {flashOn && (
          <motion.div
            key="overlay-flash"
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}