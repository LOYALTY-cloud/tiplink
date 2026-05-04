"use client";

interface LiquidBackgroundProps {
  primaryColor?: string;
  speed?: number;     // 1–10, default 5
  intensity?: number; // 1–10, default 5
}

export default function LiquidBackground({
  primaryColor = "#7c3aed",
  speed = 5,
  intensity = 5,
}: LiquidBackgroundProps) {
  const duration = Math.max(2, 16 - speed * 1.3).toFixed(1);

  // Build a 3-stop gradient from the primary color with varying opacity
  const alpha1 = ((intensity / 10) * 0.5 + 0.1).toFixed(2);
  const alpha2 = ((intensity / 10) * 0.3 + 0.06).toFixed(2);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="absolute inset-[-20%] animate-theme-liquid-shift"
        style={{
          background: `
            radial-gradient(ellipse 70% 60% at 20% 30%, ${primaryColor}${Math.round(parseFloat(alpha1) * 255).toString(16).padStart(2, "0")} 0%, transparent 70%),
            radial-gradient(ellipse 50% 50% at 80% 70%, ${primaryColor}${Math.round(parseFloat(alpha2) * 255).toString(16).padStart(2, "0")} 0%, transparent 60%)
          `,
          animationDuration: `${duration}s`,
        }}
      />
    </div>
  );
}
