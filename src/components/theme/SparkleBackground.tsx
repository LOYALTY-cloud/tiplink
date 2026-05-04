"use client";

interface SparkleBackgroundProps {
  primaryColor?: string;
  speed?: number;
  intensity?: number;
}

export default function SparkleBackground({
  primaryColor = "#ffffff",
  speed = 5,
  intensity = 5,
}: SparkleBackgroundProps) {
  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const opacity = 0.15 + (clampedIntensity / 10) * 0.55;
  const duration = Math.max(3, 12 - speed * 0.6).toFixed(2);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 animate-theme-sparkle"
        style={{
          backgroundImage: `radial-gradient(${primaryColor} 1.2px, transparent 1.4px), radial-gradient(rgba(255,255,255,0.85) 0.9px, transparent 1.1px)`,
          backgroundSize: "38px 38px, 64px 64px",
          backgroundPosition: "0 0, 14px 20px",
          opacity,
          animationDuration: `${duration}s`,
          willChange: "background-position",
        }}
      />
    </div>
  );
}
