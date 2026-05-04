"use client";

import { motion } from "framer-motion";

interface Props {
  intensity?: number;
  speed?: number;
}

export default function SmokeOverlay({ intensity = 5, speed = 5 }: Props) {
  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const clampedSpeed = Math.min(10, Math.max(1, speed));

  const density = 0.7 + (clampedIntensity / 10) * 0.6;
  const driftSpeed = Math.max(0.7, 1.35 - clampedSpeed * 0.05);
  const baseOpacity = 0.08 + (clampedIntensity / 10) * 0.08;

  return (
    <>
      {/* Back smoke: widest and slowest layer */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          x: ["0%", "10%", "0%"],
          y: ["0%", "-5%", "0%"],
          rotate: [0, 2, -2, 0],
          opacity: [baseOpacity * 0.8, baseOpacity * 1.05, baseOpacity * 0.8],
        }}
        transition={{ duration: 26 * driftSpeed, repeat: Infinity, ease: "linear" }}
        style={{
          background:
            "radial-gradient(circle at 30% 60%, rgba(185,190,205,0.16), transparent 72%)",
          filter: "blur(56px)",
          transform: `scale(${1 + density * 0.03})`,
        }}
      />

      {/* Mid smoke: most visible texture */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          x: ["0%", "-15%", "0%"],
          y: ["0%", "-10%", "0%"],
          rotate: [0, 5, -5, 0],
          opacity: [baseOpacity, baseOpacity * 1.35, baseOpacity],
        }}
        transition={{ duration: 18 * driftSpeed, repeat: Infinity, ease: "linear" }}
        style={{
          background:
            "radial-gradient(circle at 70% 50%, rgba(210,214,228,0.2), transparent 70%)",
          filter: "blur(64px)",
          transform: `scale(${1 + density * 0.05})`,
        }}
      />

      {/* Front smoke: tighter curls and higher contrast */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          x: ["0%", "20%", "0%"],
          y: ["0%", "-15%", "0%"],
          rotate: [0, 7, -6, 0],
          opacity: [baseOpacity * 1.1, baseOpacity * 1.5, baseOpacity * 1.1],
        }}
        transition={{ duration: 13 * driftSpeed, repeat: Infinity, ease: "linear" }}
        style={{
          background:
            "radial-gradient(circle at 50% 80%, rgba(220,224,240,0.22), transparent 68%)",
          filter: "blur(70px)",
          transform: `scale(${1 + density * 0.06})`,
        }}
      />
    </>
  );
}
