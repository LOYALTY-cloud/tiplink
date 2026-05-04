"use client";

interface GlowBackgroundProps {
  primaryColor?: string;
  speed?: number;       // 1–10, default 5
  intensity?: number;   // 1–10, default 5
}

export default function GlowBackground({
  primaryColor = "#7c3aed",
  speed = 5,
  intensity = 5,
}: GlowBackgroundProps) {
  const duration = Math.max(1, 12 - speed).toFixed(1);
  const opacity = (intensity / 10) * 0.55 + 0.1;
  const size = 40 + intensity * 6;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {/* Primary glow orb */}
      <div
        className="absolute rounded-full blur-[80px] animate-theme-glow-pulse"
        style={{
          width: `${size}%`,
          height: `${size}%`,
          background: primaryColor,
          opacity,
          top: "10%",
          left: "20%",
          animationDuration: `${duration}s`,
        }}
      />
      {/* Secondary offset orb */}
      <div
        className="absolute rounded-full blur-[120px] animate-theme-glow-pulse"
        style={{
          width: `${size * 0.7}%`,
          height: `${size * 0.7}%`,
          background: primaryColor,
          opacity: opacity * 0.5,
          bottom: "15%",
          right: "15%",
          animationDuration: `${parseFloat(duration) * 1.4}s`,
          animationDelay: `${parseFloat(duration) * 0.4}s`,
        }}
      />
    </div>
  );
}
