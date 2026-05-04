"use client";

interface ColorWaveBackgroundProps {
  primaryColor?: string;
  speed?: number;
  intensity?: number;
}

export default function ColorWaveBackground({
  primaryColor = "#7c3aed",
  speed = 5,
  intensity = 5,
}: ColorWaveBackgroundProps) {
  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const opacity = 0.2 + (clampedIntensity / 10) * 0.6;
  const duration = Math.max(2.6, 9 - speed * 0.55).toFixed(2);

  return (
    <div
      className="absolute inset-0 animate-theme-color-wave"
      aria-hidden="true"
      style={{
        background: `linear-gradient(270deg, ${primaryColor}, #3333ff, #00ffcc, ${primaryColor})`,
        backgroundSize: "600% 600%",
        opacity,
        animationDuration: `${duration}s`,
        willChange: "background-position",
      }}
    />
  );
}
