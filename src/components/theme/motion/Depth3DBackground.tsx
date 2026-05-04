"use client";

import { motion } from "framer-motion";

interface Props {
  image?: string;
  speed?: number;
  subjectImage?: string;
  backgroundImage?: string;
}

export default function Depth3DBackground({
  image,
  speed = 5,
  subjectImage,
  backgroundImage,
}: Props) {
  const depthSpeed = Math.max(0.6, Math.min(1.6, 1.35 - (speed - 5) * 0.08));
  const bgDuration = 11 * depthSpeed;
  const fgDuration = 6.5 * depthSpeed;

  const bgSrc = backgroundImage ?? image;
  const fgSrc = subjectImage ?? image;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        perspective: "1200px",
        background: "linear-gradient(135deg, #080b16 0%, #0f1730 100%)",
      }}
    >
      {bgSrc ? (
        <motion.img
          src={bgSrc}
          alt="depth background"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "blur(2px) saturate(0.95) brightness(0.82)" }}
          animate={{
            scale: [1.03, 1.08, 1.03],
            x: [-12, 12, -12],
            y: [-6, 4, -6],
          }}
          transition={{ duration: bgDuration, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(74,110,255,0.2),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(20,180,255,0.18),transparent_50%)]" />
      )}

      <div className="absolute inset-0 bg-black/30" />

      {fgSrc ? (
        <motion.img
          src={fgSrc}
          alt="depth foreground"
          className="absolute bottom-0 left-1/2 h-[78%] w-auto -translate-x-1/2 object-contain"
          style={{
            transformStyle: "preserve-3d",
            filter: "drop-shadow(0 34px 70px rgba(0,0,0,0.65))",
          }}
          animate={{
            x: [-18, 20, -18],
            y: [2, -10, 2],
            rotateY: [-8, 10, -8],
            rotateX: [2, -3, 2],
            scale: [1, 1.03, 1],
          }}
          transition={{ duration: fgDuration, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className="absolute bottom-10 left-1/2 h-64 w-56 -translate-x-1/2 rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/15 to-white/5"
          style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
          animate={{ x: [-14, 14, -14], rotateY: [-10, 10, -10], scale: [1, 1.03, 1] }}
          transition={{ duration: fgDuration, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            "linear-gradient(120deg, rgba(255,255,255,0.04), transparent 45%)",
            "linear-gradient(240deg, rgba(255,255,255,0.16), transparent 45%)",
            "linear-gradient(120deg, rgba(255,255,255,0.04), transparent 45%)",
          ],
        }}
        transition={{ duration: fgDuration, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}