"use client";

import { motion } from "framer-motion";

interface Props {
  image?: string;
  speed?: number;
}

export default function HeartbeatBackground({ image, speed = 5 }: Props) {
  const duration = Math.max(0.9, 1.5 - speed * 0.06);

  const backgroundStyle: React.CSSProperties = image
    ? {
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 38%, #0f3460 100%)",
      };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <motion.div
        className="absolute inset-[-4%]"
        style={backgroundStyle}
        animate={{
          scale: [1, 1.085, 1, 1.04, 1],
          filter: [
            "brightness(1) blur(0px)",
            "brightness(1.16) blur(0.8px)",
            "brightness(1) blur(0px)",
            "brightness(1.08) blur(0.45px)",
            "brightness(1) blur(0px)",
          ],
        }}
        transition={{
          duration,
          times: [0, 0.2, 0.4, 0.56, 1],
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 22%, rgba(255,255,255,0) 62%)",
        }}
        animate={{ opacity: [0, 0.24, 0, 0.1, 0] }}
        transition={{
          duration,
          times: [0, 0.2, 0.4, 0.56, 1],
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 26%, rgba(255,255,255,0) 58%)",
        }}
        animate={{ opacity: [0, 0.12, 0, 0.06, 0] }}
        transition={{
          duration,
          times: [0, 0.2, 0.4, 0.56, 1],
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}