"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  image?: string;
  speed?: number;
  subjectImage?: string;
  midImage?: string;
  backgroundImage?: string;
  onCameraPosChange?: (pos: { x: number; y: number }) => void;
}

export default function MultiLayerPopBackground({
  image,
  speed = 5,
  subjectImage,
  midImage,
  backgroundImage,
  onCameraPosChange,
}: Props) {
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const pointerInsideRef = useRef(false);
  const gyroInitRef = useRef(false);

  const bgSrc = backgroundImage ?? image;
  const midSrc = midImage;
  const fgSrc = subjectImage ?? image;

  const spring = useMemo(
    () => ({
      type: "spring" as const,
      stiffness: 160 + speed * 12,
      damping: Math.max(12, 22 - speed * 0.7),
      mass: 0.82,
    }),
    [speed]
  );

  const parallaxSpring = useMemo(
    () => ({
      type: "spring" as const,
      stiffness: 60,
      damping: 20,
      mass: 0.7,
    }),
    []
  );

  const idleDuration = useMemo(() => Math.max(3.8, 7 - speed * 0.35), [speed]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
    const y = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
    setPos({ x: clamp(x, -1, 1), y: clamp(y, -1, 1) });
  };

  const enableGyroIfAvailable = async () => {
    if (gyroInitRef.current) return;
    gyroInitRef.current = true;

    if (typeof window === "undefined") return;
    const OrientationCtor = window.DeviceOrientationEvent as
      | (typeof window.DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> })
      | undefined;

    if (!OrientationCtor) return;

    if (typeof OrientationCtor.requestPermission === "function") {
      try {
        const permission = await OrientationCtor.requestPermission();
        if (permission === "granted") setGyroEnabled(true);
      } catch {
        // Ignore silently; pointer drag remains available everywhere.
      }
      return;
    }

    setGyroEnabled(true);
  };

  useEffect(() => {
    if (!gyroEnabled || typeof window === "undefined") return;

    const handleTilt = (e: DeviceOrientationEvent) => {
      if (pointerInsideRef.current) return;
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 0;
      const x = clamp(gamma / 30, -1, 1);
      const y = clamp(beta / 45, -1, 1);
      setPos({ x, y });
    };

    window.addEventListener("deviceorientation", handleTilt);
    return () => window.removeEventListener("deviceorientation", handleTilt);
  }, [gyroEnabled]);

  useEffect(() => {
    onCameraPosChange?.(pos);
  }, [pos, onCameraPosChange]);

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      style={{ perspective: "1400px", transformStyle: "preserve-3d" }}
      onPointerDown={() => {
        setActive((v) => !v);
        void enableGyroIfAvailable();
      }}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        setPos({ x: 0, y: 0 });
      }}
    >
      {bgSrc ? (
        <motion.img
          src={bgSrc}
          alt="scene background"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "blur(2px) brightness(0.84)" }}
          animate={{
            scale: active ? 0.95 : 1,
            x: pos.x * -20 + (active ? -10 : 0),
            y: pos.y * -20 + (active ? -6 : 0),
          }}
          transition={parallaxSpring}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(104,148,255,0.25),transparent_55%),radial-gradient(circle_at_75%_82%,rgba(255,196,120,0.12),transparent_52%),linear-gradient(155deg,#090d1d_0%,#111c38_100%)]" />
      )}

      <div className="absolute inset-0 bg-black/22" />

      {midSrc && (
        <motion.img
          src={midSrc}
          alt="scene mid layer"
          className="absolute bottom-0 left-1/2 z-[8] h-[72%] w-auto -translate-x-1/2 object-contain"
          style={{ filter: "drop-shadow(0 16px 36px rgba(0,0,0,0.48))" }}
          animate={{
            scale: active ? 1.05 : 1,
            x: pos.x * -40 + (active ? -8 : 0),
            y: pos.y * -40 + (active ? -20 : 0),
            rotateY: pos.x * 4 + (active ? 5 : 0),
            rotateX: pos.y * -3,
          }}
          transition={parallaxSpring}
        />
      )}

      <motion.div
        className="absolute bottom-10 left-1/2 z-[9] h-14 w-56 -translate-x-1/2 rounded-full bg-black/60 blur-2xl"
        animate={{
          scale: active ? 1.3 : [1, 1.08, 1],
          opacity: active ? 0.72 : [0.38, 0.52, 0.38],
          x: pos.x * -22,
          y: pos.y * -12 + (active ? 6 : 2),
        }}
        transition={
          active
            ? { duration: 0.45, ease: "easeOut" }
            : { duration: idleDuration + 0.8, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {fgSrc ? (
        <motion.img
          src={fgSrc}
          alt="scene foreground"
          className="absolute bottom-0 left-1/2 z-10 h-[82%] w-auto -translate-x-1/2 object-contain"
          style={{
            transformStyle: "preserve-3d",
            filter: "drop-shadow(0 26px 70px rgba(0,0,0,0.66))",
          }}
          animate={{
            scale: active ? 1.15 : 1,
            x: pos.x * -80 + (active ? 6 : 0),
            y: pos.y * -80 + (active ? -50 : 0),
            rotateY: pos.x * 10 + (active ? 10 : 0),
            rotateX: pos.y * -10 + (active ? 2.5 : 0),
          }}
          transition={active ? spring : parallaxSpring}
        />
      ) : (
        <motion.div
          className="absolute bottom-0 left-1/2 z-10 h-[72%] w-64 -translate-x-1/2 rounded-[2rem] border border-white/20 bg-white/10 backdrop-blur-sm"
          animate={{
            scale: active ? 1.15 : 1,
            x: pos.x * -80,
            y: pos.y * -80 + (active ? -50 : 0),
            rotateY: pos.x * 10 + (active ? 10 : 0),
            rotateX: pos.y * -10,
          }}
          transition={active ? spring : parallaxSpring}
        />
      )}

      <motion.div
        className="pointer-events-none absolute inset-0 z-[11]"
        animate={{
          opacity: active ? 0.9 : 0.5,
          backgroundPositionX: active ? ["-35%", "125%"] : ["-60%", "100%"],
        }}
        transition={{
          opacity: { duration: 0.45, ease: "easeOut" },
          backgroundPositionX: {
            duration: active ? 0.9 : 3.2,
            ease: "easeInOut",
          },
        }}
        style={{
          backgroundImage:
            "linear-gradient(108deg, rgba(255,255,255,0) 28%, rgba(255,255,255,0.22) 48%, rgba(255,255,255,0.04) 62%, rgba(255,255,255,0) 72%)",
          backgroundSize: "240% 100%",
          mixBlendMode: "screen",
          WebkitMaskImage:
            fgSrc
              ? `url(${fgSrc})`
              : "radial-gradient(circle at 50% 65%, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 70%)",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: fgSrc ? "auto 82%" : "55% 72%",
          WebkitMaskPosition: "center bottom",
          maskImage:
            fgSrc
              ? `url(${fgSrc})`
              : "radial-gradient(circle at 50% 65%, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 70%)",
          maskRepeat: "no-repeat",
          maskSize: fgSrc ? "auto 82%" : "55% 72%",
          maskPosition: "center bottom",
        }}
      />

      <div className="pointer-events-none absolute inset-0 z-[12] border-[14px] border-black/50" />
    </div>
  );
}