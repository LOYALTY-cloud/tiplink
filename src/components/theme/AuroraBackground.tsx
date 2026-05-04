"use client";

interface AuroraBackgroundProps {
  primaryColor?: string;
  speed?: number;
  intensity?: number;
}

export default function AuroraBackground({
  primaryColor = "#00ffcc",
  speed = 5,
  intensity = 5,
}: AuroraBackgroundProps) {
  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const opacity = 0.28 + (clampedIntensity / 10) * 0.58;
  const duration = Math.max(3.2, 9.2 - speed * 0.46).toFixed(2);
  const glowOpacity = 0.12 + (clampedIntensity / 10) * 0.3;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-[-12%] blur-2xl animate-theme-aurora-flow"
        style={{
          background: `
            radial-gradient(circle at 20% 30%, ${primaryColor}f2 0%, transparent 48%),
            radial-gradient(circle at 80% 70%, #ff00ccde 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, #0066ffcf 0%, transparent 56%)
          `,
          backgroundSize: "220% 220%",
          opacity,
          animationDuration: `${duration}s`,
          willChange: "background-position",
        }}
      />

      <div
        className="absolute inset-[-18%] blur-3xl animate-theme-aurora-flow"
        style={{
          background: `
            radial-gradient(circle at 68% 22%, ${primaryColor}8a 0%, transparent 44%),
            radial-gradient(circle at 28% 76%, #a855f7b8 0%, transparent 46%)
          `,
          backgroundSize: "240% 240%",
          opacity: glowOpacity,
          animationDuration: `${(parseFloat(duration) * 1.25).toFixed(2)}s`,
          animationDelay: "-1.2s",
          mixBlendMode: "screen",
          willChange: "background-position",
        }}
      />
    </div>
  );
}
