"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";

interface Props {
  image?: string;
  speed?: number;
  subjectImage?: string;
  backgroundImage?: string;
}

export default function LayeredPopOutBackground({
  image,
  speed = 5,
  subjectImage,
  backgroundImage,
}: Props) {
  const [active, setActive] = useState(false);

  const bgSrc = backgroundImage ?? image;
  const fgSrc = subjectImage ?? image;

  const spring = useMemo(
    () => ({
      type: "spring" as const,
      stiffness: 160 + speed * 10,
      damping: 22 - Math.min(10, speed * 0.6),
      mass: 0.85,
    }),
    [speed]
  );

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      style={{ perspective: "1200px" }}
      onPointerDown={() => setActive((v) => !v)}
    >
      {bgSrc ? (
        <motion.img
          src={bgSrc}
          alt="popout background"
          className="absolute inset-0 h-full w-full object-cover"
          animate={{
            scale: active ? 0.955 : 1,
            filter: active ? "brightness(0.78)" : "brightness(0.9)",
          }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(58,96,255,0.25),transparent_55%),radial-gradient(circle_at_78%_80%,rgba(0,198,255,0.2),transparent_52%),linear-gradient(160deg,#090f20_0%,#0f1a35_100%)]" />
      )}

      <div className="absolute inset-0 bg-black/18" />

      <motion.div
        className="absolute bottom-12 left-1/2 h-14 w-56 -translate-x-1/2 rounded-full bg-black/55 blur-2xl"
        animate={{
          scale: active ? 1.28 : 1,
          opacity: active ? 0.75 : 0.5,
          y: active ? 10 : 0,
        }}
        transition={{ duration: 0.42, ease: "easeOut" }}
      />

      {fgSrc ? (
        <motion.img
          src={fgSrc}
          alt="popout subject"
          className="absolute bottom-0 left-1/2 z-10 h-[82%] w-auto -translate-x-1/2 object-contain"
          style={{ transformStyle: "preserve-3d", filter: "drop-shadow(0 30px 80px rgba(0,0,0,0.65))" }}
          animate={{
            scale: active ? 1.14 : 1,
            y: active ? -44 : [0, -5, 0],
            rotateY: active ? 11 : 0,
            rotateX: active ? 2 : 0,
          }}
          transition={active ? spring : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className="absolute bottom-0 left-1/2 z-10 h-[72%] w-64 -translate-x-1/2 rounded-[2rem] border border-white/20 bg-white/10 backdrop-blur-sm"
          animate={{
            scale: active ? 1.14 : 1,
            y: active ? -44 : [0, -5, 0],
            rotateY: active ? 11 : 0,
          }}
          transition={active ? spring : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={{
          opacity: active ? 0.85 : 0.5,
          background: active
            ? "linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.02) 35%, rgba(0,0,0,0) 100%)"
            : "linear-gradient(115deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 30%, rgba(0,0,0,0) 100%)",
        }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />

      <div className="pointer-events-none absolute inset-0 border-[16px] border-black/55" />
    </div>
  );
}
