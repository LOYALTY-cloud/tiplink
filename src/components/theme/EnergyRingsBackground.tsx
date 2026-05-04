"use client";

interface EnergyRingsBackgroundProps {
  primaryColor?: string;
  speed?: number;
  intensity?: number;
}

export default function EnergyRingsBackground({
  primaryColor = "#00ffc8",
  speed = 5,
  intensity = 5,
}: EnergyRingsBackgroundProps) {
  const clampedIntensity = Math.min(10, Math.max(1, intensity));
  const alpha = 0.28 + (clampedIntensity / 10) * 0.58;
  const durationA = Math.max(1.8, 3.8 - speed * 0.17).toFixed(2);
  const durationB = Math.max(2.2, 4.8 - speed * 0.18).toFixed(2);
  const durationC = Math.max(2.6, 5.8 - speed * 0.2).toFixed(2);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute w-[220px] h-[220px] rounded-full blur-2xl"
        style={{
          background: `radial-gradient(circle, ${primaryColor}55 0%, transparent 70%)`,
          opacity: Math.min(0.9, alpha + 0.15),
          mixBlendMode: "screen",
        }}
      />

      <div
        className="absolute w-[300px] h-[300px] rounded-full border animate-theme-ring-pulse"
        style={{
          borderColor: `color-mix(in srgb, ${primaryColor} 100%, transparent)`,
          opacity: alpha,
          animationDuration: `${durationA}s`,
          boxShadow: `0 0 20px color-mix(in srgb, ${primaryColor} 55%, transparent)`,
        }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full border animate-theme-ring-pulse"
        style={{
          borderColor: `rgba(255,0,200,${alpha})`,
          animationDuration: `${durationB}s`,
          animationDelay: "-0.85s",
          boxShadow: "0 0 28px rgba(255,0,200,0.25)",
        }}
      />
      <div
        className="absolute w-[680px] h-[680px] rounded-full border animate-theme-ring-pulse"
        style={{
          borderColor: `rgba(0,140,255,${Math.max(0.16, alpha - 0.15)})`,
          animationDuration: `${durationC}s`,
          animationDelay: "-1.3s",
          boxShadow: "0 0 32px rgba(0,140,255,0.22)",
        }}
      />
    </div>
  );
}
