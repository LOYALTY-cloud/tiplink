"use client";

interface NeonWaveBackgroundProps {
  speed?: number;      // 1-10
  intensity?: number;  // 1-10
}

export default function NeonWaveBackground({
  speed = 5,
  intensity = 5,
}: NeonWaveBackgroundProps) {
  const duration = Math.max(3, 12 - speed * 0.85).toFixed(1);
  const opacity = (Math.min(10, Math.max(1, intensity)) / 10) * 0.6;

  return (
    <div
      className="absolute inset-0 pointer-events-none animate-theme-neon-wave"
      aria-hidden="true"
      style={{
        background: "linear-gradient(270deg, #00f0ff, #ff00f0, #00ff99)",
        backgroundSize: "600% 600%",
        opacity,
        animationDuration: `${duration}s`,
      }}
    />
  );
}
