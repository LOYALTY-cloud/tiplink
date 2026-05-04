"use client";

type Props = {
  progress: number;
};

export default function CircleProgress({ progress }: Props) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="relative w-28 h-28 mx-auto">
      {/* Background track */}
      <div className="absolute inset-0 rounded-full bg-white/[0.06]" />

      {/* Progress ring */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-700 ease-out"
        style={{
          background: `conic-gradient(#10b981 ${clampedProgress}%, rgba(255,255,255,0.08) ${clampedProgress}%)`,
        }}
      />

      {/* Inner circle */}
      <div className="absolute inset-2 bg-[#050A1A] rounded-full flex items-center justify-center">
        <span className="text-lg font-semibold text-white">
          {Math.round(clampedProgress)}%
        </span>
      </div>
    </div>
  );
}
