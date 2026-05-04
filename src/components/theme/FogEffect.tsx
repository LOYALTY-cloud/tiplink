"use client";

interface FogEffectProps {
  speed?: number;
  intensity?: number;
}

export default function FogEffect({ speed = 5, intensity = 5 }: FogEffectProps) {
  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const opacity = 0.08 + (clampedIntensity / 10) * 0.28;
  const duration = Math.max(6, 14 - speed * 0.6);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute inset-[-12%] animate-theme-fog-drift"
        style={{
          background:
            "radial-gradient(circle at 24% 38%, rgba(255,255,255,0.35), transparent 56%), radial-gradient(circle at 72% 62%, rgba(200,220,255,0.28), transparent 58%)",
          opacity,
          animationDuration: `${duration}s`,
        }}
      />
    </div>
  );
}
