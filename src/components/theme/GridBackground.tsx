"use client";

interface GridBackgroundProps {
  primaryColor?: string;
  speed?: number;     // 1–10, default 5
  intensity?: number; // 1–10, default 5
}

export default function GridBackground({
  primaryColor = "#7c3aed",
  speed = 5,
  intensity = 5,
}: GridBackgroundProps) {
  const duration = Math.max(1, 14 - speed * 1.2).toFixed(1);
  const lineOpacity = ((intensity / 10) * 0.28 + 0.05).toFixed(3);
  const cellSize = Math.round(30 + (10 - intensity) * 4);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={
        {
          "--grid-color": primaryColor,
          "--grid-opacity": lineOpacity,
          "--cell-size": `${cellSize}px`,
          "--grid-duration": `${duration}s`,
        } as React.CSSProperties
      }
    >
      <div className="absolute inset-0 animate-theme-grid-move theme-grid-lines" />
    </div>
  );
}
