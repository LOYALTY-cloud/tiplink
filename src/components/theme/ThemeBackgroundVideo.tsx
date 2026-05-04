"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { MotionType } from "@/lib/animationAccess";

type VideoMotionProps = {
  animate: import("framer-motion").TargetAndTransition;
  transition: import("framer-motion").Transition;
};

type Props = {
  src: string;
  poster?: string;
  className?: string;
  muted?: boolean;
  context?: "builder" | "public";
  disableActiveVideoSync?: boolean;
  onVideoError?: () => void;
  onVideoReady?: () => void;
  motionType?: MotionType | null;
  speed?: number;
  intensity?: number;
  motionSettings?: {
    clubBeat?: "slow" | "normal" | "fast";
    clubFlashMode?: "off" | "white" | "club";
    seasonalDensity?: "low" | "medium" | "high";
    rainGlassStyle?: "drizzle" | "storm" | "neon";
  };
};

type SeasonalPreset = "leaves";

type SeasonalPackConfig = {
  size: number;
  wind: number;
  duration: number;
  blur: number;
  count: number;
  opacity: [number, number, number, number];
  tint: string;
};

type BeachBallState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  squashX: number;
  squashY: number;
  size: number;
};

type ImpactEdge = "left" | "right" | "top";

type RainTrailPoint = { x: number; y: number };

type RainDrop = {
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  stretch: number;
  trail: RainTrailPoint[];
};

type RainStream = {
  x: number;
  y: number;
  width: number;
  speed: number;
  length: number;
  opacity: number;
};

type GlitchSlice = {
  top: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
};

const SEASONAL_PACKS: Record<SeasonalPreset, SeasonalPackConfig> = {
  leaves: {
    size: 16,
    wind: 88,
    duration: 9,
    blur: 0.35,
    count: 15,
    opacity: [0, 0.72, 0.9, 0],
    tint: "#f59e0b",
  },
};

let activeVideo: HTMLVideoElement | null = null;

export default function ThemeBackgroundVideo({
  src,
  poster,
  className,
  muted = true,
  context = "public",
  disableActiveVideoSync = false,
  onVideoError,
  onVideoReady,
  motionType = null,
  speed = 5,
  intensity = 5,
  motionSettings,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beachBallRefs = useRef<Array<HTMLDivElement | null>>([]);
  const beachBallStatesRef = useRef<BeachBallState[]>([]);
  const beachBallRafRef = useRef<number | null>(null);
  const [shakePulse, setShakePulse] = useState(false);
  const [flashPulse, setFlashPulse] = useState(false);
  const [flashColor, setFlashColor] = useState("rgba(255,255,255,0.9)");
  const [glitchPulse, setGlitchPulse] = useState(false);
  const [glitchShift, setGlitchShift] = useState({ x: 0, y: 0 });
  const [glitchSlices, setGlitchSlices] = useState<GlitchSlice[]>([]);
  const [glassPulse, setGlassPulse] = useState(false);
  const [impactPulse, setImpactPulse] = useState(false);
  const [impactCycle, setImpactCycle] = useState(0);
  const [impactEdge, setImpactEdge] = useState<ImpactEdge>("left");

  const speedScale = Math.max(0.6, Math.min(1.6, 1.6 - speed / 10));
  const intensityScale = Math.max(0.6, Math.min(1.6, 0.6 + intensity / 10));
  const rainGlassStyle = motionSettings?.rainGlassStyle ?? "drizzle";
  const rainStyleProfile =
    rainGlassStyle === "storm"
      ? { density: 1.62, speed: 1.38, blur: 2.5, trail: 0.32, drop: 0.55, shine: 0.16, shadow: 0.18 }
      : rainGlassStyle === "neon"
      ? { density: 1.2, speed: 1.1, blur: 2.0, trail: 0.28, drop: 0.45, shine: 0.2, shadow: 0.12 }
      : { density: 1.34, speed: 1.08, blur: 2.0, trail: 0.28, drop: 0.5, shine: 0.14, shadow: 0.15 };
  const rainSpeedFactor = Math.max(0.55, Math.min(1.35, 1.9 - speedScale)) * rainStyleProfile.speed;
  const rainDensity = Math.max(60, Math.round((80 + intensityScale * 40) * rainStyleProfile.density));
  const streetImpactPulseDuration = Math.max(0.14, 0.22 * speedScale);
  const streetImpactTravelDuration = Math.max(0.24, 0.42 * speedScale);
  const streetImpactCycleMs = Math.max(420, Math.round(920 * speedScale));

  // Pseudo-random for per-piece variation
  function pseudo(seed: number): number {
    const s = Math.sin(seed * 91.77) * 43758.5453;
    return s - Math.floor(s);
  }

  const seasonalPreset: SeasonalPreset | null =
    motionType === "leaves" || motionType === "leafWind"
      ? "leaves"
      : null;

  const seasonalDensity = motionSettings?.seasonalDensity ?? "medium";
  const seasonalScale =
    seasonalDensity === "low"
      ? { wind: 0.82, count: 0.82 }
      : seasonalDensity === "high"
      ? { wind: 1.22, count: 1.22 }
      : { wind: 1, count: 1 };

  const beachBallCount = motionType === "beachBall" ? (intensity >= 8 ? 2 : 1) : 0;

  const motionProps: VideoMotionProps = (() => {
    switch (motionType) {
      case "videoCinematicPan":
        return {
          animate: {
            scale: [1.08, 1.14, 1.08],
            x: ["-2%", "2%", "-2%"],
            y: ["-2%", "1%", "-2%"],
          },
          transition: {
            duration: 12 * speedScale,
            repeat: Infinity,
            ease: "linear",
          },
        };
      case "videoParallax":
        return {
          animate: {
            scale: [1.1, 1.14, 1.1],
            x: [0, 8 * intensityScale, -8 * intensityScale, 0],
            y: [0, -5 * intensityScale, 5 * intensityScale, 0],
          },
          transition: {
            duration: 10 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "videoWaveDrift":
        return {
          animate: {
            x: [0, 5 * intensityScale, -5 * intensityScale, 0],
            y: [0, -3 * intensityScale, 3 * intensityScale, 0],
            scale: [1.07, 1.1, 1.07],
          },
          transition: {
            duration: 8.5 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "videoSlowZoom":
        return {
          animate: {
            scale: [1.06, 1.13 + (intensityScale - 1) * 0.03, 1.06],
          },
          transition: {
            duration: 10 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "videoVortexZoom":
        return {
          animate: {
            scale: [1.08, 1.16 + (intensityScale - 1) * 0.05, 1.08],
            rotate: [0, 0.8 * intensityScale, -0.8 * intensityScale, 0],
            x: [0, 10 * intensityScale, -10 * intensityScale, 0],
            y: [0, -6 * intensityScale, 6 * intensityScale, 0],
          },
          transition: {
            duration: 9.5 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "videoTilt":
        return {
          animate: {
            rotateX: [0, 1.4 * intensityScale, -1.4 * intensityScale, 0],
            rotateY: [0, -1.6 * intensityScale, 1.6 * intensityScale, 0],
            scale: [1.07, 1.1, 1.07],
          },
          transition: {
            duration: 7.8 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "videoShakeClub":
        return {
          animate: shakePulse
            ? {
                x: [0, -9 * intensityScale, 9 * intensityScale, -6 * intensityScale, 6 * intensityScale, 0],
                y: [0, 5 * intensityScale, -5 * intensityScale, 3 * intensityScale, -3 * intensityScale, 0],
                rotate: [0, -0.6 * intensityScale, 0.8 * intensityScale, -0.45 * intensityScale, 0],
                scale: [1.08, 1.1, 1.08],
              }
            : {
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1.08,
              },
          transition: {
            duration: shakePulse ? 0.38 : 0.22,
            ease: "easeInOut",
          },
        };
      case "videoGlitch":
        return {
          animate: glitchPulse
            ? {
                x: [0, -6 * intensityScale, 8 * intensityScale, -5 * intensityScale, 0],
                y: [0, 3 * intensityScale, -2.5 * intensityScale, 0],
                scale: [1.07, 1.1, 1.065],
                filter: ["contrast(1) saturate(1)", `contrast(${1.2 + intensityScale * 0.16}) saturate(${1.3 + intensityScale * 0.18})`, "contrast(1) saturate(1)"],
              }
            : {
                x: 0,
                y: 0,
                scale: 1.07,
                filter: "contrast(1) saturate(1)",
              },
          transition: {
            duration: glitchPulse ? 0.22 : 0.22,
            ease: "easeInOut",
          },
        };
      case "streetImpact":
        return {
          animate: impactPulse
            ? {
                x:
                  impactEdge === "left"
                    ? [0, -14 * intensityScale, 12 * intensityScale, -7 * intensityScale, 4 * intensityScale, 0]
                    : impactEdge === "right"
                    ? [0, 14 * intensityScale, -12 * intensityScale, 7 * intensityScale, -4 * intensityScale, 0]
                    : [0, -5 * intensityScale, 5 * intensityScale, -3 * intensityScale, 3 * intensityScale, 0],
                y:
                  impactEdge === "top"
                    ? [0, -12 * intensityScale, 7 * intensityScale, -4 * intensityScale, 2 * intensityScale, 0]
                    : [0, 6 * intensityScale, -6 * intensityScale, 3 * intensityScale, -3 * intensityScale, 0],
                rotate:
                  impactEdge === "left"
                    ? [0, -0.9 * intensityScale, 0.55 * intensityScale, -0.2 * intensityScale, 0]
                    : impactEdge === "right"
                    ? [0, 0.9 * intensityScale, -0.55 * intensityScale, 0.2 * intensityScale, 0]
                    : [0, -0.35 * intensityScale, 0.35 * intensityScale, 0],
                scale: [1.06, 1.085, 1.04, 1.06],
                filter: ["brightness(1)", `brightness(${1.18 * intensityScale})`, "brightness(1.03)", "brightness(1)"],
              }
            : {
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1.06,
                filter: "brightness(1)",
              },
          transition: {
            duration: impactPulse ? streetImpactPulseDuration : Math.max(0.12, streetImpactPulseDuration * 0.7),
            ease: [0.2, 0.9, 0.28, 1],
          },
        };
      case "rainGlass":
        return {
          animate: {
            scale: [1.03, 1.045, 1.03],
            x: [0, -2 * intensityScale, 2 * intensityScale, 0],
            y: [0, 1.5 * intensityScale, -1.5 * intensityScale, 0],
          },
          transition: {
            duration: 13 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "beachBall":
        return {
          animate: {
            scale: [1.02, 1.03, 1.02],
          },
          transition: {
            duration: 10 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "bounce":
        return {
          animate: {
            x: [0, 8 * intensityScale, 0, -8 * intensityScale, 0],
            y: [0, -6 * intensityScale, 0, 6 * intensityScale, 0],
          },
          transition: {
            duration: 6 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "heartbeat":
        return {
          animate: {
            scale: [1, 1.015 * intensityScale, 1, 1.03 * intensityScale, 1],
          },
          transition: {
            duration: 2.2 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "flashHit":
        return {
          animate: {
            filter: ["brightness(1)", `brightness(${1.15 * intensityScale})`, "brightness(1)"],
          },
          transition: {
            duration: 2.8 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "glassBreak":
        return {
          animate: {
            scale: [1.06, 1.13 + (intensityScale - 1) * 0.05, 0.985, 1.04, 1.06],
            x: [0, -2 * intensityScale, 2 * intensityScale, -1 * intensityScale, 0],
            y: [0, 1.5 * intensityScale, -1 * intensityScale, 0],
            rotate: [0, -0.2 * intensityScale, 0.22 * intensityScale, -0.1 * intensityScale, 0],
            filter: [
              "brightness(1) contrast(1)",
              `brightness(${1.35 * intensityScale}) contrast(${1.25 * intensityScale})`,
              `brightness(${0.9 + intensityScale * 0.05}) contrast(${1.1 * intensityScale})`,
              "brightness(1.08) contrast(1.06)",
              "brightness(1) contrast(1)",
            ],
          },
          transition: {
            duration: 1.15 * speedScale,
            repeat: Infinity,
            repeatDelay: Math.max(1.25, 3.8 * speedScale),
            ease: [0.22, 1, 0.36, 1],
          },
        };
      case "image3D":
      case "depth3D":
      case "layeredPopOut":
      case "multiLayerPop":
      case "vortexTunnel":
        return {
          animate: {
            scale: [1.06, 1.12 + (intensityScale - 1) * 0.04, 1.06],
            x: [0, 10 * intensityScale, 0, -10 * intensityScale, 0],
            y: [0, -6 * intensityScale, 0, 6 * intensityScale, 0],
          },
          transition: {
            duration: 10 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "ripple":
      case "waterDistortion":
        return {
          animate: {
            scale: [1.06, 1.09 + (intensityScale - 1) * 0.03, 1.06],
            filter: ["saturate(1)", `saturate(${1.08 * intensityScale})`, "saturate(1)"],
          },
          transition: {
            duration: 8 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "leafWind":
      case "leaves":
        return {
          animate: {
            scale: [1.03, 1.05, 1.03],
          },
          transition: {
            duration: 14 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      default:
        return {
          animate: {
            scale: [1.04, 1.08, 1.04],
          },
          transition: {
            duration: 12 * speedScale,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
    }
  })();

  useEffect(() => {
    if (motionType !== "videoShakeClub") {
      setShakePulse(false);
      setFlashPulse(false);
      return;
    }

    const clubBeat = motionSettings?.clubBeat ?? "normal";
    const flashMode = motionSettings?.clubFlashMode ?? "club";

    const flashColors =
      flashMode === "white"
        ? ["rgba(255,255,255,0.9)"]
        : [
            "rgba(255,0,0,0.78)",
            "rgba(0,0,255,0.72)",
            "rgba(255,0,255,0.76)",
            "rgba(255,255,255,0.9)",
          ];

    let burstTimeout: ReturnType<typeof setTimeout> | null = null;
    let flashTimeout: ReturnType<typeof setTimeout> | null = null;
    const beatBaseMs = clubBeat === "slow" ? 1500 : clubBeat === "fast" ? 900 : 1200;
    const burstEveryMs = Math.max(620, Math.round(beatBaseMs * speedScale));

    const triggerPulse = () => {
      setShakePulse(true);
      burstTimeout = setTimeout(() => setShakePulse(false), 300);

      if (flashMode !== "off" && Math.random() > 0.42) {
        const nextFlash = flashColors[Math.floor(Math.random() * flashColors.length)];
        setFlashColor(nextFlash);
        setFlashPulse(true);
        flashTimeout = setTimeout(() => setFlashPulse(false), 150);
      }
    };

    triggerPulse();
    const interval = setInterval(triggerPulse, burstEveryMs);

    return () => {
      clearInterval(interval);
      if (burstTimeout) clearTimeout(burstTimeout);
      if (flashTimeout) clearTimeout(flashTimeout);
      setShakePulse(false);
      setFlashPulse(false);
    };
  }, [motionType, speedScale, motionSettings?.clubBeat, motionSettings?.clubFlashMode]);

  useEffect(() => {
    if (motionType !== "videoGlitch") {
      setGlitchPulse(false);
      setGlitchShift({ x: 0, y: 0 });
      setGlitchSlices([]);
      return;
    }

    let pulseTimeout: ReturnType<typeof setTimeout> | null = null;
    let scheduleTimeout: ReturnType<typeof setTimeout> | null = null;

    const trigger = () => {
      const channelOffset = 6 + intensityScale * 5 + Math.random() * 4;
      const channelY = (Math.random() - 0.5) * 2 * (1.4 + intensityScale * 2.2);
      const sliceCount = 10;
      const slicePower = 8 + intensityScale * 12;
      const slices: GlitchSlice[] = Array.from({ length: sliceCount }).map((_, i) => {
        const baseTop = (i * 100) / sliceCount;
        const top = Math.max(0, Math.min(96, baseTop + (Math.random() * 5 - 2.5)));
        const height = 6 + Math.random() * 8;
        return {
          top,
          height,
          x: (Math.random() - 0.5) * 2 * slicePower,
          y: (Math.random() - 0.5) * 2 * (1 + intensityScale * 2.6),
          opacity: 0.44 + Math.random() * 0.34,
        };
      });

      setGlitchShift({
        x: channelOffset,
        y: channelY,
      });
      setGlitchSlices(slices);
      setGlitchPulse(true);

      pulseTimeout = setTimeout(() => setGlitchPulse(false), Math.round(170 + intensityScale * 90));
    };

    const schedule = () => {
      const nextMs = Math.max(740, Math.round((980 + Math.random() * 1500) * speedScale));
      scheduleTimeout = setTimeout(() => {
        trigger();
        schedule();
      }, nextMs);
    };

    trigger();
    schedule();

    return () => {
      if (pulseTimeout) clearTimeout(pulseTimeout);
      if (scheduleTimeout) clearTimeout(scheduleTimeout);
      setGlitchPulse(false);
    };
  }, [motionType, speedScale, intensityScale]);

  useEffect(() => {
    if (motionType !== "glassBreak") {
      setGlassPulse(false);
      return;
    }

    const cycleMs = Math.max(1200, Math.round(2100 * speedScale));
    let clearPulseTimeout: ReturnType<typeof setTimeout> | null = null;

    const trigger = () => {
      setGlassPulse(true);
      clearPulseTimeout = setTimeout(() => setGlassPulse(false), 700);
    };

    trigger();
    const interval = setInterval(trigger, cycleMs);

    return () => {
      clearInterval(interval);
      if (clearPulseTimeout) clearTimeout(clearPulseTimeout);
      setGlassPulse(false);
    };
  }, [motionType, speedScale]);

  useEffect(() => {
    if (motionType !== "rainGlass") {
      return;
    }

    const canvas = rainCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame = 0;
    const dpr = window.devicePixelRatio || 1;
    const drops: RainDrop[] = [];

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const createDrop = (): RainDrop => {
      // Mix of tiny beads (r=1-3) and large blobs (r=4-9) for realism
      const roll = Math.random();
      const radius = roll < 0.55
        ? 1.2 + Math.random() * 2.2          // small bead
        : roll < 0.85
        ? 3.5 + Math.random() * 3.5          // mid drop
        : 6 + Math.random() * 4;             // big sliding blob
      const spd = (0.12 + Math.random() * 0.7) * rainSpeedFactor;
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: radius,
        speed: spd,
        sway: (Math.random() - 0.5) * 0.22,
        stretch: 1.2 + spd * 1.4,
        trail: [],
      };
    };

    const resetDrop = (drop: RainDrop) => {
      drop.x = Math.random() * window.innerWidth;
      drop.y = -24 - Math.random() * window.innerHeight * 0.28;
      const roll = Math.random();
      drop.r = roll < 0.55 ? 1.2 + Math.random() * 2.2 : roll < 0.85 ? 3.5 + Math.random() * 3.5 : 6 + Math.random() * 4;
      drop.speed = (0.12 + Math.random() * 0.7) * rainSpeedFactor;
      drop.sway = (Math.random() - 0.5) * 0.22;
      drop.stretch = 1.2 + drop.speed * 1.4;
      drop.trail.length = 0;
    };

    const streamCount = rainGlassStyle === "storm" ? 22 : rainGlassStyle === "neon" ? 16 : 15;
    const streams: RainStream[] = Array.from({ length: streamCount }).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      width: 0.8 + Math.random() * 2.2,
      speed: (0.9 + Math.random() * 2.1) * rainSpeedFactor,
      length: 80 + Math.random() * 220,
      opacity: 0.12 + Math.random() * 0.22,
    }));

    resize();
    for (let i = 0; i < rainDensity; i += 1) {
      drops.push(createDrop());
    }

    let prev = performance.now();
    const animateRain = (now: number) => {
      const dt = Math.max(0.65, Math.min(1.8, (now - prev) / 16.667));
      prev = now;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // ── STREAMS (long dripping lines — the key cinematic layer) ─────────────
      for (const s of streams) {
        s.y += s.speed * dt;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineWidth = s.width;

        // dark under-line for contrast on bright backgrounds
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y + s.length);
        ctx.strokeStyle = `rgba(0,0,0,${rainStyleProfile.shadow * 0.7})`;
        ctx.lineWidth = s.width + 0.6;
        ctx.stroke();

        // main gradient streak
        const sg = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.length);
        if (rainGlassStyle === "neon") {
          sg.addColorStop(0, `rgba(56,189,248,${s.opacity * 1.4})`);
          sg.addColorStop(0.5, `rgba(244,114,182,${s.opacity})`);
          sg.addColorStop(1, "rgba(56,189,248,0.02)");
        } else {
          sg.addColorStop(0, `rgba(255,255,255,${s.opacity * 1.5})`);
          sg.addColorStop(0.55, `rgba(200,230,255,${s.opacity * 0.7})`);
          sg.addColorStop(1, "rgba(255,255,255,0.02)");
        }
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y + s.length);
        ctx.strokeStyle = sg;
        ctx.lineWidth = s.width;
        ctx.stroke();
        ctx.restore();

        if (s.y > window.innerHeight) {
          s.y = -(s.length + Math.random() * 200);
          s.x = Math.random() * window.innerWidth;
          s.length = 80 + Math.random() * 220;
          s.width = 0.8 + Math.random() * 2.2;
          s.opacity = 0.12 + Math.random() * 0.22;
          s.speed = (0.9 + Math.random() * 2.1) * rainSpeedFactor;
        }
      }

      // ── DROPS (beads + blobs with radial gradient shine) ─────────────────────
      for (const drop of drops) {
        const drift = drop.sway * dt * (1 + intensityScale * 0.35);
        const fall = drop.speed * dt * (0.9 + intensityScale * 0.22);
        drop.x += drift;
        drop.y += fall;

        // trail
        drop.trail.push({ x: drop.x, y: drop.y });
        const trailLength = Math.max(4, Math.round(drop.r * 2.5));
        if (drop.trail.length > trailLength) drop.trail.shift();

        if (drop.trail.length > 2) {
          // dark under-trail
          ctx.beginPath();
          for (let i = 0; i < drop.trail.length; i += 1) {
            const pt = drop.trail[i];
            if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
          ctx.lineWidth = Math.max(1.1, drop.r * 0.75);
          ctx.lineCap = "round";
          ctx.strokeStyle = `rgba(0,0,0,${rainStyleProfile.shadow})`;
          ctx.stroke();

          // white highlight trail
          ctx.beginPath();
          for (let i = 0; i < drop.trail.length; i += 1) {
            const pt = drop.trail[i];
            if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
          ctx.lineWidth = Math.max(0.7, drop.r * 0.6);
          ctx.strokeStyle =
            rainGlassStyle === "neon"
              ? Math.floor((drop.x + drop.y) * 0.05) % 2 === 0
                ? `rgba(56,189,248,${rainStyleProfile.trail})`
                : `rgba(244,114,182,${rainStyleProfile.trail})`
              : `rgba(255,255,255,${rainStyleProfile.trail})`;
          ctx.stroke();
        }

        // drop shadow (depth)
        ctx.beginPath();
        const stretchY = drop.r * (drop.stretch + 0.12);
        ctx.ellipse(drop.x, drop.y + 0.3, drop.r * 1.08, stretchY, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${rainStyleProfile.shadow})`;
        ctx.fill();

        // main drop body — radial gradient for wet-glass shine
        const bodyStretch = drop.r * drop.stretch;
        const gr = ctx.createRadialGradient(
          drop.x - drop.r * 0.28, drop.y - drop.r * 0.28, 0,
          drop.x, drop.y, Math.max(drop.r, bodyStretch)
        );
        if (rainGlassStyle === "neon") {
          gr.addColorStop(0, "rgba(220,240,255,0.82)");
          gr.addColorStop(0.38, "rgba(56,189,248,0.45)");
          gr.addColorStop(1, "rgba(186,230,253,0.05)");
        } else {
          gr.addColorStop(0, `rgba(255,255,255,${Math.min(0.95, rainStyleProfile.drop * 2.2)})`);
          gr.addColorStop(0.42, `rgba(200,228,255,${rainStyleProfile.drop * 0.85})`);
          gr.addColorStop(1, `rgba(255,255,255,0.04)`);
        }
        ctx.beginPath();
        ctx.ellipse(drop.x, drop.y, drop.r, bodyStretch, 0, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();

        // bright specular highlight (top-left)
        ctx.beginPath();
        ctx.ellipse(
          drop.x - drop.r * 0.24,
          drop.y - drop.r * 0.22,
          drop.r * 0.32,
          drop.r * 0.48,
          0, 0, Math.PI * 2
        );
        ctx.fillStyle = rainGlassStyle === "neon" ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.72)";
        ctx.fill();

        if (drop.y > window.innerHeight + 28 || drop.x < -40 || drop.x > window.innerWidth + 40) {
          resetDrop(drop);
        }
      }

      animationFrame = requestAnimationFrame(animateRain);
    };

    animationFrame = requestAnimationFrame(animateRain);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [motionType, intensityScale, rainDensity, rainGlassStyle, rainSpeedFactor, rainStyleProfile.drop, rainStyleProfile.trail]);

  useEffect(() => {
    if (motionType !== "streetImpact") {
      setImpactPulse(false);
      setImpactCycle(0);
      setImpactEdge("left");
      return;
    }

    let clearPulseTimeout: ReturnType<typeof setTimeout> | null = null;
    const edges: ImpactEdge[] = ["left", "right", "top"];

    const trigger = () => {
      setImpactEdge(edges[Math.floor(Math.random() * edges.length)]);
      setImpactCycle((value) => value + 1);
      setImpactPulse(true);
      clearPulseTimeout = setTimeout(() => setImpactPulse(false), Math.round(streetImpactPulseDuration * 1000));
    };

    trigger();
    const interval = setInterval(trigger, streetImpactCycleMs);

    return () => {
      clearInterval(interval);
      if (clearPulseTimeout) clearTimeout(clearPulseTimeout);
      setImpactPulse(false);
    };
  }, [motionType, speedScale, streetImpactCycleMs, streetImpactPulseDuration]);

  useEffect(() => {
    if (motionType !== "beachBall") {
      if (beachBallRafRef.current) {
        cancelAnimationFrame(beachBallRafRef.current);
        beachBallRafRef.current = null;
      }
      beachBallStatesRef.current = [];
      return;
    }

    const getBounds = () => {
      const container = videoRef.current?.parentElement;
      const width = Math.max(320, container?.clientWidth ?? window.innerWidth);
      const height = Math.max(240, container?.clientHeight ?? window.innerHeight);
      return { width, height };
    };

    const bounds = getBounds();
    const baseSpeed = 2.2 + (intensityScale - 0.6) * 1.1;
    const minSpeed = 2;

    beachBallStatesRef.current = Array.from({ length: beachBallCount }).map((_, i) => {
      const size = 68 + Math.round(pseudo(i + 711) * 14);
      const safeWidth = Math.max(1, bounds.width - size);
      const safeHeight = Math.max(1, bounds.height - size);
      const x = pseudo(i + 702) * safeWidth;
      const y = pseudo(i + 703) * safeHeight;
      const vx = ((pseudo(i + 704) - 0.5) * 2.6 + (i % 2 === 0 ? 1 : -1) * 1.15) * baseSpeed;
      const vy = ((pseudo(i + 705) - 0.5) * 1.8 + 0.6) * baseSpeed;

      return {
        x,
        y,
        vx,
        vy,
        rotation: pseudo(i + 706) * 360,
        spin: (pseudo(i + 707) - 0.5) * 2.4,
        squashX: 1,
        squashY: 1,
        size,
      };
    });

    let prev = performance.now();

    const animate = (now: number) => {
      const dt = Math.max(0.65, Math.min(2.1, (now - prev) / 16.667));
      prev = now;
      const { width, height } = getBounds();

      beachBallStatesRef.current.forEach((ball, i) => {
        let hit = false;

        // Arcade integration: constant-energy movement (no gravity/damping).
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        if (ball.x <= 0) {
          ball.x = 0;
          ball.vx = Math.abs(ball.vx);
          hit = true;
        } else if (ball.x + ball.size >= width) {
          ball.x = width - ball.size;
          ball.vx = -Math.abs(ball.vx);
          hit = true;
        }

        if (ball.y <= 0) {
          ball.y = 0;
          ball.vy = Math.abs(ball.vy);
          hit = true;
        } else if (ball.y + ball.size >= height) {
          ball.y = height - ball.size;
          ball.vy = -Math.abs(ball.vy);
          hit = true;
        }

        if (Math.abs(ball.vx) < minSpeed) {
          ball.vx = minSpeed * Math.sign(ball.vx || 1);
        }
        if (Math.abs(ball.vy) < minSpeed) {
          ball.vy = minSpeed * Math.sign(ball.vy || 1);
        }

        ball.rotation += (ball.spin + ball.vx * 1.25) * dt;

        if (hit) {
          ball.squashX = 1.15;
          ball.squashY = 0.84;
        }
        ball.squashX += (1 - ball.squashX) * 0.24 * dt;
        ball.squashY += (1 - ball.squashY) * 0.24 * dt;

        const node = beachBallRefs.current[i];
        if (!node) return;

        if (node.dataset.ready !== "1") {
          node.style.width = `${ball.size}px`;
          node.style.height = `${ball.size}px`;
          node.dataset.ready = "1";
        }

        node.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0) rotate(${ball.rotation}deg) scale(${ball.squashX}, ${ball.squashY})`;
        node.style.boxShadow = hit
          ? "0 22px 28px rgba(0,0,0,0.32)"
          : "0 14px 20px rgba(0,0,0,0.24)";
      });

      beachBallRafRef.current = requestAnimationFrame(animate);
    };

    beachBallRafRef.current = requestAnimationFrame(animate);

    return () => {
      if (beachBallRafRef.current) {
        cancelAnimationFrame(beachBallRafRef.current);
        beachBallRafRef.current = null;
      }
    };
  }, [beachBallCount, intensityScale, motionType]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (disableActiveVideoSync) {
      void video.play().catch(() => {});
      return () => {
        video.pause();
      };
    }

    if (context === "builder") {
      if (activeVideo && activeVideo !== video) {
        activeVideo.pause();
      }
      activeVideo = video;
      void video.play().catch((err) => {
        console.warn("Video play error:", err);
      });
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!videoRef.current) return;

        if (entry.isIntersecting) {
          if (activeVideo && activeVideo !== videoRef.current) {
            activeVideo.pause();
          }
          activeVideo = videoRef.current;
          void videoRef.current.play().catch(() => {});
          return;
        }

        videoRef.current.pause();
        if (activeVideo === videoRef.current) {
          activeVideo = null;
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      video.pause();
      if (activeVideo === video) {
        activeVideo = null;
      }
    };
  }, [src, context, disableActiveVideoSync]);

  return (
    <>
      <motion.video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="auto"
        controls={context === "builder"}
        crossOrigin="anonymous"
        className={className ?? "absolute inset-0 h-full w-full object-cover"}
        onPlay={() => {
          if (disableActiveVideoSync) return;
          if (activeVideo && activeVideo !== videoRef.current) {
            activeVideo.pause();
          }
          activeVideo = videoRef.current;
        }}
        onError={(e) => {
          const video = e.target as HTMLVideoElement;
          console.error("Video failed to load:", {
            src,
            errorCode: video.error?.code,
            errorMessage: video.error?.message,
          });
          onVideoError?.();
        }}
        onLoadedData={() => {
          console.log("Video ready to play");
          onVideoReady?.();
        }}
        onCanPlay={() => {
          // Video is ready
        }}
        onLoadStart={() => {
          // Video loading started
        }}
        animate={motionProps.animate}
        transition={motionProps.transition}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {motionType === "videoShakeClub" && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: flashColor,
            mixBlendMode: "overlay",
          }}
          animate={{ opacity: flashPulse ? [0, 0.82, 0] : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      )}

      {motionType === "videoGlitch" && (
        <>
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ mixBlendMode: "screen", filter: "contrast(1.25) saturate(1.6) sepia(1) hue-rotate(-50deg)" }}
            animate={{
              opacity: glitchPulse ? 0.72 : 0,
              x: glitchPulse ? -glitchShift.x : 0,
              y: glitchPulse ? glitchShift.y : 0,
            }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <video src={src} poster={poster} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          </motion.div>

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ mixBlendMode: "screen", filter: "contrast(1.25) saturate(1.6) sepia(1) hue-rotate(200deg)" }}
            animate={{
              opacity: glitchPulse ? 0.72 : 0,
              x: glitchPulse ? glitchShift.x : 0,
              y: glitchPulse ? -glitchShift.y : 0,
            }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <video src={src} poster={poster} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          </motion.div>

          {glitchSlices.map((slice, i) => {
            const bottomPct = Math.max(0, 100 - (slice.top + slice.height));
            return (
              <motion.div
                key={`glitch-slice-${i}`}
                className="absolute inset-0 pointer-events-none overflow-hidden"
                style={{
                  clipPath: `inset(${slice.top}% 0 ${bottomPct}% 0)`,
                  mixBlendMode: "screen",
                  filter: i % 2 === 0 ? "contrast(1.2) hue-rotate(200deg)" : "contrast(1.2) hue-rotate(-55deg)",
                }}
                animate={{
                  opacity: glitchPulse ? slice.opacity : 0,
                  x: glitchPulse ? slice.x : 0,
                  y: glitchPulse ? slice.y : 0,
                }}
                transition={{ duration: 0.12, ease: "easeOut" }}
              >
                <video src={src} poster={poster} autoPlay muted loop playsInline className="h-full w-full object-cover" />
              </motion.div>
            );
          })}

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.2) 0px, rgba(255,255,255,0.2) 1px, rgba(255,255,255,0) 2px, rgba(255,255,255,0) 4px)",
              mixBlendMode: "overlay",
            }}
            animate={{ opacity: glitchPulse ? [0.08, 0.52, 0.08] : 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 48%, rgba(255,255,255,0) 100%)", mixBlendMode: "screen" }}
            animate={{ opacity: glitchPulse ? [0, 0.7, 0] : 0, x: glitchPulse ? [0, 20, -12, 0] : 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        </>
      )}

      {motionType === "streetImpact" && (
        <>
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "rgba(255,255,255,0.96)", mixBlendMode: "screen" }}
            animate={{ opacity: impactPulse ? [0, 0.95, 0.28, 0] : 0 }}
            transition={{ duration: streetImpactPulseDuration, ease: "easeOut" }}
          />

          <motion.div
            className="absolute pointer-events-none"
            style={{
              inset: impactEdge === "left" ? "0 auto 0 0" : impactEdge === "right" ? "0 0 0 auto" : "0 0 auto 0",
              width: impactEdge === "top" ? "100%" : `${18 + intensityScale * 6}%`,
              height: impactEdge === "top" ? `${14 + intensityScale * 5}%` : "100%",
              background:
                impactEdge === "left"
                  ? "linear-gradient(90deg, rgba(255,255,255,0.65) 0%, rgba(251,191,36,0.4) 36%, rgba(251,191,36,0) 100%)"
                  : impactEdge === "right"
                  ? "linear-gradient(270deg, rgba(255,255,255,0.65) 0%, rgba(251,191,36,0.4) 36%, rgba(251,191,36,0) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(251,191,36,0.45) 42%, rgba(251,191,36,0) 100%)",
              mixBlendMode: "screen",
            }}
            animate={{ opacity: impactPulse ? [0, 1, 0.45, 0] : 0 }}
            transition={{ duration: Math.max(0.16, streetImpactPulseDuration * 1.1), ease: "easeOut" }}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none overflow-hidden"
            animate={{ opacity: impactPulse ? [0, 1, 0.4, 0] : 0 }}
            transition={{ duration: streetImpactTravelDuration, ease: "easeOut" }}
          >
            {Array.from({ length: 12 }).map((_, i) => {
              const seed = impactCycle * 31 + i;
              const startX =
                impactEdge === "left"
                  ? -6
                  : impactEdge === "right"
                  ? 106
                  : pseudo(seed + 1) * 100;
              const startY =
                impactEdge === "top"
                  ? -6
                  : 18 + pseudo(seed + 2) * 64;
              const travelX =
                impactEdge === "left"
                  ? 20 + pseudo(seed + 3) * 42
                  : impactEdge === "right"
                  ? -(20 + pseudo(seed + 3) * 42)
                  : (pseudo(seed + 3) - 0.5) * 42;
              const travelY =
                impactEdge === "top"
                  ? 20 + pseudo(seed + 4) * 42
                  : (pseudo(seed + 4) - 0.5) * 30;
              const rotate = (pseudo(seed + 5) - 0.5) * 160;
              const length = 10 + pseudo(seed + 6) * 22;
              const thickness = 2 + pseudo(seed + 7) * 2.4;
              const delay = pseudo(seed + 8) * 0.06;

              return (
                <motion.div
                  key={`street-impact-${impactCycle}-${i}`}
                  className="absolute rounded-full"
                  style={{
                    left: `${startX}%`,
                    top: `${startY}%`,
                    width: `${length}px`,
                    height: `${thickness}px`,
                    background: i % 3 === 0 ? "rgba(255,255,255,0.96)" : i % 3 === 1 ? "rgba(251,191,36,0.92)" : "rgba(248,113,113,0.88)",
                    boxShadow: "0 0 12px rgba(255,255,255,0.35)",
                  }}
                  initial={{ x: 0, y: 0, rotate, opacity: 0, scaleX: 0.6 }}
                  animate={
                    impactPulse
                      ? {
                          x: [0, travelX],
                          y: [0, travelY],
                          rotate: [rotate, rotate + (pseudo(seed + 9) - 0.5) * 46],
                          opacity: [0, 1, 0.7, 0],
                          scaleX: [0.6, 1, 1, 0.85],
                        }
                      : { x: 0, y: 0, opacity: 0, scaleX: 0.6 }
                  }
                  transition={{ duration: streetImpactTravelDuration, delay, ease: "easeOut" }}
                />
              );
            })}
          </motion.div>
        </>
      )}

      {motionType === "rainGlass" && (
        <>
          <canvas
            ref={rainCanvasRef}
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              opacity: 1,
              mixBlendMode: rainGlassStyle === "neon" ? "screen" : "normal",
            }}
          />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backdropFilter: `blur(${Math.max(2.4, rainStyleProfile.blur * intensityScale)}px)`,
              WebkitBackdropFilter: `blur(${Math.max(2.4, rainStyleProfile.blur * intensityScale)}px)`,
              background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 100%)",
            }}
          />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                rainGlassStyle === "neon"
                  ? "linear-gradient(120deg, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.08) 22%, rgba(255,255,255,0) 46%), linear-gradient(336deg, rgba(56,189,248,0.2) 0%, rgba(56,189,248,0.06) 34%, rgba(255,255,255,0) 56%)"
                  : `linear-gradient(120deg, rgba(255,255,255,${rainStyleProfile.shine}) 0%, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0) 46%), linear-gradient(340deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 44%)`,
              mixBlendMode: "screen",
            }}
          />
        </>
      )}

      {motionType === "glassBreak" && (
        <>
          <motion.div
            className="absolute inset-0 pointer-events-none bg-white"
            animate={{ opacity: glassPulse ? [0, 0.36, 0] : 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            style={{ mixBlendMode: "screen" }}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ opacity: glassPulse ? [0, 0.95, 0.28, 0] : 0 }}
            transition={{ duration: 0.72, ease: "easeOut" }}
          >
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <g stroke="rgba(255,255,255,0.88)" strokeWidth="0.45" fill="none" strokeLinecap="round">
                <path d="M50 50 L36 33 L22 21 L10 12" />
                <path d="M50 50 L63 34 L78 24 L92 16" />
                <path d="M50 50 L47 66 L45 82 L44 96" />
                <path d="M50 50 L34 56 L20 62 L8 70" />
                <path d="M50 50 L66 57 L80 66 L94 78" />
                <path d="M50 50 L58 38 L66 28" />
                <path d="M50 50 L41 60 L32 70" />
              </g>
            </svg>
          </motion.div>

          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ opacity: glassPulse ? [0, 1, 0] : 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => {
              // 4x4 grid setup for 16 pieces
              const row = Math.floor(i / 4);
              const col = i % 4;
              const impactX = 50;
              const impactY = 50;

              // Distance from center
              const pieceCenterX = ((col + 0.5) / 4) * 100;
              const pieceCenterY = ((row + 0.5) / 4) * 100;
              const dx = (pieceCenterX - impactX) / 10;
              const dy = (pieceCenterY - impactY) / 10;
              const distance = Math.hypot(dx, dy) || 1;
              const nx = dx / distance;
              const ny = dy / distance;
              const force = 14 + pseudo(i + 11) * 18;

              const launchX = nx * force + (pseudo(i + 1) - 0.5) * 6.4;
              const launchY = Math.max(13, ny * (11 + pseudo(i + 12) * 16) + 19 + pseudo(i + 2) * 24);
              const fallDistance = Math.max(28, launchY * (0.84 + pseudo(i + 101) * 0.24));
              const bounceHeight = 7.2 + pseudo(i + 77) * 4.8;
              const settleDropA = 2.2 + pseudo(i + 41) * 1.4;
              const settleDropB = 1.0 + pseudo(i + 59) * 1.0;
              const driftX = launchX * (0.6 + pseudo(i + 13) * 0.2);
              const rotate = (pseudo(i + 3) - 0.5) * 152;
              const spin = rotate * (0.7 + pseudo(i + 89) * 0.4);
              const delay = pseudo(i + 4) * 0.16;

              return (
                <motion.div
                  key={`fragment-${i}`}
                  className="absolute border border-white/30 bg-white/12 backdrop-blur-[1px]"
                  style={{
                    left: `${pieceCenterX}%`,
                    top: `${pieceCenterY}%`,
                    width: "25%",
                    height: "25%",
                    transform: "translate(-50%, -50%)",
                    boxShadow: "0 8px 14px rgba(0,0,0,0.28)",
                  }}
                  initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scaleX: 1, scaleY: 1 }}
                  animate={
                    glassPulse
                      ? {
                          x: [0, driftX * 0.7, driftX * 0.86, driftX * 0.95, driftX],
                          y: [
                            0,
                            fallDistance,
                            fallDistance - bounceHeight,
                            fallDistance - settleDropA,
                            fallDistance - settleDropB,
                          ],
                          rotate: [0, spin * 0.56, spin * 0.82, spin * 0.95, spin],
                          scaleY: [1, 1, 0.8, 0.94, 1],
                          scaleX: [1, 1, 1.16, 1.03, 1],
                          opacity: [1, 1, 1, 0.7, 0],
                          boxShadow: [
                            "0 12px 18px rgba(0,0,0,0.24)",
                            "0 32px 44px rgba(0,0,0,0.52)",
                            "0 22px 32px rgba(0,0,0,0.42)",
                            "0 16px 26px rgba(0,0,0,0.36)",
                            "0 8px 14px rgba(0,0,0,0.2)",
                          ],
                        }
                      : { x: 0, y: 0, rotate: 0, opacity: 1, scaleX: 1, scaleY: 1 }
                  }
                  transition={{
                    duration: glassPulse ? 1.4 : 0,
                    delay: glassPulse ? delay : 0,
                    times: [0, 0.5, 0.7, 0.86, 1],
                    ease: "easeOut",
                  }}
                />
              );
            })}
          </motion.div>
        </>
      )}

      {seasonalPreset && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: Math.max(8, Math.round(SEASONAL_PACKS[seasonalPreset].count * seasonalScale.count)) }).map((_, i) => {
            const config = SEASONAL_PACKS[seasonalPreset];
            const particleDuration = config.duration + pseudo(i + 200) * 3;
            const windStrength = (config.wind + pseudo(i + 300) * config.wind * 0.8) * intensityScale * seasonalScale.wind;
            const windDirection = pseudo(i + 350) > 0.5 ? 1 : -1;
            const particleScale = 0.62 + pseudo(i + 400) * 0.62;
            const particleBlur = pseudo(i + 500) * config.blur;
            const startX = pseudo(i + 100) * 100;
            const delay = (i * 0.42) / speedScale;
            const sway = pseudo(i + 450) * Math.max(24, config.wind * 0.9) + config.wind * 0.55;
            const width = Math.round((config.size + pseudo(i + 470) * config.size * 0.35) * particleScale);

            const node = (
              <svg viewBox="0 0 24 24" className="h-full w-full">
                <path
                  d="M12 2C7.58 2 4 5.58 4 10c0 2.16.84 4.13 2.21 5.58 1.37 1.45 3.22 2.38 5.29 2.38 2.1 0 4 .9 5.29 2.38 1.37-1.45 2.21-3.42 2.21-5.58s-.84-4.13-2.21-5.58C16 5.58 14.1 4 12 2zm0 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"
                  fill="currentColor"
                  opacity="0.9"
                />
              </svg>
            );

            return (
              <motion.div
                key={`seasonal-${seasonalPreset}-${i}`}
                className="absolute"
                style={{
                  width: `${width}px`,
                  height: `${width}px`,
                  left: `${startX}%`,
                  top: "-50px",
                  transform: "translate(-50%, 0)",
                  filter: `blur(${particleBlur}px)`,
                  opacity: 0.68 + pseudo(i + 600) * 0.3,
                  color: config.tint,
                }}
                initial={{
                  y: -50,
                  opacity: 0,
                  rotateZ: 0,
                }}
                animate={{
                  x: [
                    0,
                    windStrength * 0.2 * windDirection,
                    -sway * 0.15,
                    windStrength * 0.5 * windDirection,
                    -sway * 0.3,
                    windStrength * 0.75 * windDirection,
                    -sway * 0.1,
                    windStrength * windDirection,
                  ],
                  y: [-50, "15vh", "30vh", "45vh", "60vh", "75vh", "90vh", "calc(100vh + 100px)"],
                  rotateZ: [
                    0,
                    42 * windDirection,
                    -28 * windDirection,
                    58 * windDirection,
                    -42 * windDirection,
                    70 * windDirection,
                    -48 * windDirection,
                    86 * windDirection,
                  ],
                  opacity: [
                    0,
                    config.opacity[1],
                    config.opacity[2],
                    config.opacity[2],
                    config.opacity[2],
                    config.opacity[2] - 0.08,
                    config.opacity[1],
                    config.opacity[3],
                  ],
                }}
                transition={{
                  duration: particleDuration / speedScale,
                  delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {node}
              </motion.div>
            );
          })}
        </div>
      )}

      {motionType === "beachBall" && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {Array.from({ length: beachBallCount }).map((_, i) => (
            <div
              key={`beach-ball-${i}`}
              ref={(el) => {
                beachBallRefs.current[i] = el;
              }}
              className="absolute rounded-full border border-white/70"
              style={{
                transform: "translate3d(0px, 0px, 0)",
                background: `conic-gradient(from ${30 + i * 24}deg, #fb923c 0deg 60deg, #facc15 60deg 120deg, #4ade80 120deg 180deg, #38bdf8 180deg 240deg, #c084fc 240deg 300deg, #f87171 300deg 360deg)`,
                willChange: "transform",
              }}
            >
              <div
                className="absolute rounded-full"
                style={{
                  inset: "14%",
                  border: "2px solid rgba(255,255,255,0.65)",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  width: "28%",
                  height: "28%",
                  left: "18%",
                  top: "18%",
                  background: "rgba(255,255,255,0.52)",
                  filter: "blur(0.5px)",
                }}
              />
            </div>
          ))}
        </div>
      )}

    </>
  );
}
