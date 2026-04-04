"use client";

type Props = {
  progress: number;
};

export default function CircleProgress({ progress }: Props) {
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const color = progress >= 100 ? "#22c55e" : progress > 80 ? "#22c55e" : "#34d399";

  return (
    <div className={`relative flex items-center justify-center ${progress >= 100 ? "animate-pulse" : ""}`}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          stroke="#1f2937"
          fill="transparent"
          strokeWidth={stroke}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress ring */}
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Center percentage */}
      <div className="absolute text-white font-semibold text-lg">
        {Math.round(progress)}%
      </div>
    </div>
  );
}
