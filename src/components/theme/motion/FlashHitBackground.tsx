"use client";

import { motion } from "framer-motion";

interface Props {
  image?: string;
  speed?: number;
}

export default function FlashHitBackground({ image, speed = 5 }: Props) {
  const duration = Math.max(2, 3.6 - speed * 0.16);

  const backgroundStyle: React.CSSProperties = image
    ? {
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
      };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <motion.div
        className="absolute inset-[-3%]"
        style={backgroundStyle}
        animate={{
          scale: [1, 1.022, 1.012, 1, 1],
          filter: [
            "brightness(1) saturate(1) blur(0px)",
            "brightness(1.34) saturate(1.08) blur(0.8px)",
            "brightness(1.08) saturate(1.02) blur(0.25px)",
            "brightness(0.92) saturate(0.96) blur(0px)",
            "brightness(1) saturate(1) blur(0px)",
          ],
        }}
        transition={{
          duration,
          times: [0, 0.05, 0.16, 0.34, 1],
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="absolute inset-0 bg-white"
        animate={{ opacity: [0, 1, 0.28, 0, 0] }}
        transition={{
          duration,
          times: [0, 0.05, 0.14, 0.28, 1],
          repeat: Infinity,
          ease: "easeOut",
        }}
      />

      <motion.div
        className="absolute inset-[-8%] mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, rgba(255,240,200,0.46) 20%, rgba(255,210,90,0.18) 38%, rgba(255,255,255,0) 72%)",
          filter: "blur(28px)",
        }}
        animate={{ opacity: [0, 0.86, 0.24, 0, 0] }}
        transition={{
          duration,
          times: [0, 0.07, 0.18, 0.42, 1],
          repeat: Infinity,
          ease: "easeOut",
        }}
      />

      <motion.div
        className="absolute inset-0 bg-black"
        animate={{ opacity: [0, 0, 0.2, 0.08, 0] }}
        transition={{
          duration,
          times: [0, 0.12, 0.24, 0.5, 1],
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}
