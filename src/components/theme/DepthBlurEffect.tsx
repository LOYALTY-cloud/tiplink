"use client";

interface DepthBlurEffectProps {
  image: string;
  intensity?: number;
}

export default function DepthBlurEffect({ image, intensity = 5 }: DepthBlurEffectProps) {
  const clamped = Math.min(10, Math.max(1, intensity));
  const blurPx = 4 + clamped * 0.9;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center animate-theme-depth-focus"
        style={{
          backgroundImage: `url(${image})`,
          filter: `blur(${blurPx}px)`,
          opacity: 0.78,
        }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${image})`,
          maskImage: "radial-gradient(circle at center, black 38%, transparent 74%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 38%, transparent 74%)",
        }}
      />
    </div>
  );
}
