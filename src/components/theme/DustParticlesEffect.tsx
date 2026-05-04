"use client";

interface DustParticlesEffectProps {
  speed?: number;
  intensity?: number;
}

export default function DustParticlesEffect({ speed = 5, intensity = 5 }: DustParticlesEffectProps) {
  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const opacity = 0.04 + (clampedIntensity / 10) * 0.18;
  const duration = Math.max(10, 24 - speed * 0.8);

  return (
    <div
      className="absolute inset-0 pointer-events-none animate-theme-dust-move"
      aria-hidden
      style={{
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.85) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
        backgroundSize: "28px 28px, 44px 44px",
        backgroundPosition: "0 0, 10px 14px",
        opacity,
        animationDuration: `${duration}s`,
      }}
    />
  );
}
