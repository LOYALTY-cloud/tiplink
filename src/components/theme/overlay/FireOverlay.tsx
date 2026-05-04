"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

interface Props {
  intensity?: number;
  speed?: number;
  cameraPos?: { x: number; y: number };
  fireStyle?: "embers" | "flameEdge" | "sparks";
}

type Ember = {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  drift: number;
};

export default function FireOverlay({ intensity = 5, speed = 5, cameraPos = { x: 0, y: 0 }, fireStyle = "embers" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const windRef = useRef(0);

  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const clampedSpeed = Math.min(10, Math.max(1, speed));

  const styleTuning =
    fireStyle === "sparks"
      ? { density: 1.45, speed: 1.35, drift: 1.35, glow: 0.85, flicker: 1.5, core: 1.08 }
      : fireStyle === "flameEdge"
      ? { density: 0.6, speed: 0.85, drift: 0.7, glow: 1.45, flicker: 1.1, core: 0.88 }
      : { density: 1, speed: 1, drift: 1, glow: 1, flicker: 1, core: 1 };

  const particleCount = Math.round((34 + (clampedIntensity / 10) * 42) * styleTuning.density); // 34–76 base
  const riseSpeedMult = (0.6 + (clampedSpeed / 10) * 0.7) * styleTuning.speed;
  const sourceBand = fireStyle === "sparks" ? 26 : fireStyle === "flameEdge" ? 14 : 20;
  const flameHeight = fireStyle === "flameEdge" ? "h-24" : "h-32";
  const glowHeight = fireStyle === "flameEdge" ? "h-36" : "h-40";

  useEffect(() => {
    // A little tilt-driven wind makes embers feel physically grounded.
    windRef.current = cameraPos.x * 0.35;
  }, [cameraPos.x]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resize();

    const resetEmber = (e: Ember, randomizedY = true) => {
      e.x = Math.random() * canvas.width;
      e.y = randomizedY ? canvas.height - Math.random() * sourceBand : canvas.height - Math.random() * sourceBand;
      e.size = (Math.random() * 2.1 + 0.9) * styleTuning.core;
      e.speed = (Math.random() * 1.2 + 0.45) * riseSpeedMult;
      e.opacity = Math.random() * 0.45 + 0.2;
      e.drift = (Math.random() - 0.5) * 0.45 * styleTuning.drift;
    };

    const embers: Ember[] = Array.from({ length: particleCount }).map(() => {
      const e = { x: 0, y: 0, size: 1.5, speed: 1, opacity: 0.4, drift: 0 };
      resetEmber(e);
      return e;
    });

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of embers) {
        p.y -= p.speed;
        p.x += p.drift + windRef.current * 0.08 * styleTuning.drift;

        if (p.y < -16 || p.x < -20 || p.x > canvas.width + 20) {
          resetEmber(p, false);
        }

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        g.addColorStop(0, `rgba(255,220,140,${p.opacity})`);
        g.addColorStop(0.55, `rgba(255,130,40,${p.opacity * 0.72})`);
        g.addColorStop(1, "rgba(255,70,0,0)");

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    render();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [particleCount, riseSpeedMult, sourceBand, styleTuning.core, styleTuning.drift]);

  const glowMin = (0.2 + (clampedIntensity / 10) * 0.08) * styleTuning.glow;
  const glowMax = glowMin + 0.18 * styleTuning.glow;
  const flickerMax = (0.018 + (clampedIntensity / 10) * 0.03) * styleTuning.flicker;
  const glowGradient =
    fireStyle === "flameEdge"
      ? "radial-gradient(ellipse at bottom, rgba(255,120,0,0.38), transparent 64%)"
      : fireStyle === "sparks"
      ? "radial-gradient(ellipse at bottom, rgba(255,145,40,0.24), transparent 75%)"
      : "radial-gradient(ellipse at bottom, rgba(255,120,0,0.32), transparent 72%)";
  const flameGradientFrames =
    fireStyle === "flameEdge"
      ? [
          "radial-gradient(circle at 50% 100%, rgba(255,120,0,0.42), transparent 70%)",
          "radial-gradient(circle at 42% 100%, rgba(255,95,0,0.48), transparent 70%)",
          "radial-gradient(circle at 58% 100%, rgba(255,140,0,0.42), transparent 70%)",
          "radial-gradient(circle at 50% 100%, rgba(255,120,0,0.42), transparent 70%)",
        ]
      : [
          "radial-gradient(circle at 50% 100%, rgba(255,120,0,0.34), transparent 72%)",
          "radial-gradient(circle at 40% 100%, rgba(255,80,0,0.4), transparent 72%)",
          "radial-gradient(circle at 60% 100%, rgba(255,150,0,0.35), transparent 72%)",
          "radial-gradient(circle at 50% 100%, rgba(255,120,0,0.34), transparent 72%)",
        ];

  return (
    <>
      {/* Bottom flame base: controlled, low-height, cinematic flicker */}
      <motion.div
        className={`absolute bottom-0 left-0 w-full ${flameHeight} pointer-events-none`}
        animate={{
          background: flameGradientFrames,
          y: [0, -4, 0],
          scaleY: [1, 1.08, 1],
          x: ["0%", "2%", "-2%", "0%"],
          opacity: [0.3, 0.48, 0.34],
        }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ mixBlendMode: "screen" }}
      />

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      <motion.div
        className={`absolute bottom-0 left-0 w-full ${glowHeight} pointer-events-none`}
        animate={{ opacity: [glowMin, glowMax, glowMin] }}
        transition={{ duration: Math.max(3.2, 5.2 - clampedSpeed * 0.15), repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: glowGradient,
        }}
      />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.01, flickerMax, 0.018, flickerMax * 0.65, 0.01] }}
        transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "rgba(255,120,0,0.2)", mixBlendMode: "screen" }}
      />
    </>
  );
}
