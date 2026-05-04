"use client";

interface GlassBackgroundProps {
  intensity?: number; // 1-10
}

export default function GlassBackground({ intensity = 5 }: GlassBackgroundProps) {
  const opacity = (Math.min(10, Math.max(1, intensity)) / 10) * 0.25;

  return (
    <div className="absolute inset-0 pointer-events-none backdrop-blur-xl" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(255,255,255,0.05)",
          opacity,
        }}
      />
    </div>
  );
}
