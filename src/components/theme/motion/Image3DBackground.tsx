"use client";

import { motion } from "framer-motion";

interface Props {
  image?: string;
  speed?: number;
}

export default function Image3DBackground({ image, speed = 5 }: Props) {
  const duration = Math.max(4.8, 7.4 - speed * 0.24);

  const backgroundStyle: React.CSSProperties = image
    ? {
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, #171b2f 0%, #16213e 42%, #0d385c 100%)",
      };

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
      style={{ perspective: "1000px" }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="relative h-[88%] w-[88%]"
          animate={{
            rotateY: [0, 24, -24, 0],
            rotateX: [0, 4, -4, 0],
            scale: [1, 1.03, 1.01, 1],
            filter: [
              "brightness(1) saturate(1)",
              "brightness(1.16) saturate(1.08)",
              "brightness(0.84) saturate(0.96)",
              "brightness(1) saturate(1)",
            ],
          }}
          transition={{
            duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            transformStyle: "preserve-3d",
          }}
        >
          <div
            className="absolute inset-0 rounded-[28px]"
            style={{
              ...backgroundStyle,
              boxShadow: "0 34px 90px rgba(0, 0, 0, 0.48)",
            }}
          />
          <motion.div
            className="absolute inset-0 rounded-[28px]"
            style={{
              background:
                "linear-gradient(115deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.06) 24%, rgba(255,255,255,0) 48%, rgba(0,0,0,0.18) 100%)",
              mixBlendMode: "screen",
              transform: "translateZ(18px)",
            }}
            animate={{ opacity: [0.3, 0.65, 0.18, 0.3] }}
            transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-x-[8%] bottom-[-7%] h-[18%] rounded-full bg-black/45 blur-3xl"
            animate={{ opacity: [0.22, 0.34, 0.18, 0.22], scaleX: [0.92, 1.08, 0.95, 0.92] }}
            transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </div>
  );
}