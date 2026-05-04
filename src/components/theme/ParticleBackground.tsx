"use client";

interface ParticleBackgroundProps {
  speed?: number;      // 1-10
  intensity?: number;  // 1-10
}

export default function ParticleBackground({
  speed = 5,
  intensity = 5,
}: ParticleBackgroundProps) {
  const duration = Math.max(4, 14 - speed * 0.9).toFixed(1);
  const opacity = (Math.min(10, Math.max(1, intensity)) / 10) * 0.45;

  return (
    <div
      className="absolute inset-0 pointer-events-none animate-theme-particles-move"
      aria-hidden="true"
      style={{
        backgroundImage: "radial-gradient(white 1px, transparent 1px)",
        backgroundSize: "20px 20px",
        opacity,
        animationDuration: `${duration}s`,
      }}
    />
  );
}
