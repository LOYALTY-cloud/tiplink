"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Props {
  image?: string;
  speed?: number;
  autoPlay?: boolean;
}

type Phase = "idle" | "impact" | "cracked" | "shatter";

interface ImpactPoint {
  x: number;
  y: number;
}

interface FragmentPiece {
  id: number;
  row: number;
  col: number;
  launchX: number;
  launchY: number;
  rotate: number;
  delay: number;
}

const COLS = 4;
const ROWS = 4;

function pseudo(seed: number): number {
  const s = Math.sin(seed * 91.77) * 43758.5453;
  return s - Math.floor(s);
}

export default function GlassBreakBackground({ image, speed = 5, autoPlay = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [slowMo, setSlowMo] = useState(false);
  const [shatterDuration, setShatterDuration] = useState(1.2);
  const [cycleKey, setCycleKey] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 720 });
  const [impactPoint, setImpactPoint] = useState<ImpactPoint>({ x: 600, y: 360 });

  const cycleMs = Math.max(3000, Math.round(6200 - speed * 280));

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const syncSize = () => {
      const width = Math.max(1, Math.floor(el.clientWidth));
      const height = Math.max(1, Math.floor(el.clientHeight));
      setContainerSize({ width, height });
      setImpactPoint((prev) => {
        if (prev.x <= width && prev.y <= height) return prev;
        return { x: width / 2, y: height / 2 };
      });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const triggerBreak = useCallback((point?: ImpactPoint) => {
    clearTimers();
    const fallbackPoint = {
      x: containerSize.width / 2,
      y: containerSize.height / 2,
    };
    setImpactPoint(point ?? fallbackPoint);
    setCycleKey((value) => value + 1);
    setSlowMo(true);
    setShatterDuration(2.45);
    setPhase("impact");

    timersRef.current.push(setTimeout(() => setPhase("cracked"), 120));
    timersRef.current.push(setTimeout(() => setPhase("shatter"), 320));
    timersRef.current.push(setTimeout(() => setSlowMo(false), 1200));
    timersRef.current.push(setTimeout(() => setShatterDuration(1.2), 1400));
    timersRef.current.push(setTimeout(() => setPhase("idle"), 2050));
  }, [clearTimers, containerSize.height, containerSize.width]);

  const pieces = useMemo<FragmentPiece[]>(() => {
    const list: FragmentPiece[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const id = row * COLS + col;
        const pieceCenterX = ((col + 0.5) / COLS) * containerSize.width;
        const pieceCenterY = ((row + 0.5) / ROWS) * containerSize.height;

        const dx = pieceCenterX - impactPoint.x;
        const dy = pieceCenterY - impactPoint.y;
        const distance = Math.hypot(dx, dy) || 1;
        const nx = dx / distance;
        const ny = dy / distance;
        const force = 120 + pseudo(id + 11) * 160;

        const xSpread = nx * force + (pseudo(id + 1) - 0.5) * 58;
        const ySpread = Math.max(110, ny * (90 + pseudo(id + 12) * 140) + 170 + pseudo(id + 2) * 220);
        const rotate = (pseudo(id + 3) - 0.5) * 150;
        const delay = pseudo(id + 4) * 0.18;
        list.push({ id, row, col, launchX: xSpread, launchY: ySpread, rotate, delay });
      }
    }
    return list;
  }, [containerSize.height, containerSize.width, impactPoint.x, impactPoint.y]);

  useEffect(() => {
    if (!autoPlay) {
      clearTimers();
      setPhase("idle");
      return;
    }

    triggerBreak();
    const interval = setInterval(() => triggerBreak(), cycleMs);

    return () => {
      clearInterval(interval);
      clearTimers();
    };
  }, [autoPlay, clearTimers, cycleMs, triggerBreak]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    triggerBreak({ x, y });
  };

  const sceneBackground = image
    ? `url('${image}') center / cover no-repeat`
    : "linear-gradient(135deg, #111827 0%, #1f2937 45%, #0f172a 100%)";

  const crackSize = Math.max(340, Math.min(640, Math.round(Math.min(containerSize.width, containerSize.height) * 0.58)));
  const crackLeft = impactPoint.x - crackSize / 2;
  const crackTop = impactPoint.y - crackSize / 2;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ perspective: "1100px" }}
      onPointerDown={handlePointerDown}
    >
      <div className="absolute inset-0" style={{ background: sceneBackground }} />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          scale: phase === "impact" ? 1.02 : 1,
          filter: slowMo
            ? "brightness(1.08) saturate(1.08) blur(1.2px)"
            : phase === "impact"
            ? "brightness(1.1)"
            : "brightness(1)",
        }}
        transition={{ duration: slowMo ? 0.45 : 0.18, ease: "easeOut" }}
      />

      <AnimatePresence>
        {(phase === "impact" || phase === "cracked") && (
          <motion.div
            key={`brick-${cycleKey}`}
            className="absolute left-1/2 top-1/2 h-9 w-16 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/20 bg-gradient-to-br from-rose-700 to-red-900 shadow-2xl"
            initial={{ x: -460, y: 120, rotate: -20, opacity: 0 }}
            animate={{ x: phase === "impact" ? -6 : 22, y: phase === "impact" ? 10 : -14, rotate: phase === "impact" ? 14 : 22, opacity: phase === "impact" ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(phase === "impact" || phase === "cracked" || phase === "shatter") && (
          <motion.div
            key={`cracks-${cycleKey}`}
            className="absolute pointer-events-none"
            style={{ left: crackLeft, top: crackTop, width: crackSize, height: crackSize }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "impact" ? 0.85 : phase === "cracked" ? 1 : 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <svg viewBox="0 0 520 520" className="h-full w-full">
              <g stroke="rgba(255,255,255,0.92)" strokeWidth="2.6" fill="none" strokeLinecap="round">
                <path d="M260 258 L204 190 L138 116 L74 64" />
                <path d="M260 258 L326 196 L394 144 L464 102" />
                <path d="M260 258 L246 332 L236 406 L230 490" />
                <path d="M260 258 L170 286 L102 312 L42 348" />
                <path d="M260 258 L338 294 L410 342 L482 404" />
                <path d="M260 258 L294 198 L334 146" />
                <path d="M260 258 L214 302 L166 350" />
              </g>
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "impact" && (
          <motion.div
            key={`flash-${cycleKey}`}
            className="absolute inset-0 pointer-events-none bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.78, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, times: [0, 0.35, 1], ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "shatter" && (
          <div className="absolute inset-0 pointer-events-none">
            {pieces.map((piece) => {
              const fallDistance = Math.max(280, piece.launchY * (0.8 + pseudo(piece.id + 101) * 0.2));
              const bounceHeight = 72 + pseudo(piece.id + 77) * 48;
              const settleDropA = 22 + pseudo(piece.id + 41) * 14;
              const settleDropB = 10 + pseudo(piece.id + 59) * 10;
              const driftX = piece.launchX * (0.55 + pseudo(piece.id + 13) * 0.2);
              const spin = piece.rotate * (0.75 + pseudo(piece.id + 89) * 0.35);

              return (
                <motion.div
                  key={`${cycleKey}-${piece.id}`}
                  className="absolute border border-white/20 bg-white/10 backdrop-blur-[1px]"
                  style={{
                    left: `${(piece.col / COLS) * 100}%`,
                    top: `${(piece.row / ROWS) * 100}%`,
                    width: `${100 / COLS}%`,
                    height: `${100 / ROWS}%`,
                    backgroundImage: image ? `url('${image}')` : "none",
                    backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
                    backgroundPosition: `${(piece.col / (COLS - 1)) * 100}% ${(piece.row / (ROWS - 1)) * 100}%`,
                    boxShadow: "0 8px 14px rgba(0,0,0,0.28)",
                  }}
                  initial={{ x: 0, y: 0, rotate: 0, opacity: 1, filter: "blur(0px)", scaleX: 1, scaleY: 1 }}
                  animate={{
                    x: [0, driftX * 0.72, driftX * 0.88, driftX * 0.96, driftX],
                    y: [
                      0,
                      fallDistance,
                      fallDistance - bounceHeight,
                      fallDistance - settleDropA,
                      fallDistance - settleDropB,
                    ],
                    rotate: [0, spin * 0.58, spin * 0.84, spin * 0.96, spin],
                    scaleY: [1, 1, 0.82, 0.95, 1],
                    scaleX: [1, 1, 1.14, 1.02, 1],
                    opacity: [1, 1, 1, 0.72, 0],
                    filter: ["blur(0px)", "blur(0.4px)", "blur(1.1px)", "blur(1.6px)", "blur(2.2px)"],
                    boxShadow: [
                      "0 12px 18px rgba(0,0,0,0.24)",
                      "0 32px 44px rgba(0,0,0,0.52)",
                      "0 22px 32px rgba(0,0,0,0.42)",
                      "0 16px 26px rgba(0,0,0,0.36)",
                      "0 8px 14px rgba(0,0,0,0.2)",
                    ],
                  }}
                  transition={{
                    duration: shatterDuration,
                    delay: piece.delay * 0.9,
                    times: [0, 0.52, 0.72, 0.88, 1],
                    ease: "easeOut",
                  }}
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}