"use client";

import { useEffect, useState } from "react";

interface WithdrawalTimerProps {
  releaseAt: string;
  createdAt?: string;
  onReleased?: () => void;
}

export default function WithdrawalTimer({
  releaseAt,
  createdAt,
  onReleased,
}: WithdrawalTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const diff = new Date(releaseAt).getTime() - Date.now();
    return Math.max(0, diff);
  });
  const [justReleased, setJustReleased] = useState(false);

  const releaseMs = new Date(releaseAt).getTime();
  const totalMs = createdAt
    ? releaseMs - new Date(createdAt).getTime()
    : 0;

  useEffect(() => {
    const update = () => {
      const diff = releaseMs - Date.now();
      setTimeLeft(Math.max(0, diff));
      if (diff <= 0) {
        clearInterval(iv);
        setJustReleased(true);
        onReleased?.();
      }
    };

    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [releaseMs, onReleased]);

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  const percent =
    totalMs > 0 ? Math.min(100, ((totalMs - timeLeft) / totalMs) * 100) : 100;

  if (timeLeft <= 0) {
    return (
      <div className={`relative overflow-hidden p-5 rounded-2xl border transition-all duration-300 ${
        justReleased
          ? "border-emerald-400/30 bg-emerald-500/10 animate-celebrate"
          : "border-emerald-500/20 bg-emerald-500/5"
      }`}>
        {/* Success glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-emerald-500/10 opacity-40" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm text-emerald-400 font-semibold">Payout released</p>
            <p className="text-xs text-emerald-400/60 mt-0.5">Funds are on their way to your account</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden p-5 rounded-2xl border border-white/[0.12] bg-white/5 backdrop-blur-xl animate-card-enter">
      {/* Subtle animated glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-cyan-500/10 glow-pulse pointer-events-none" />

      <div className="relative z-10 space-y-3">
        {/* Status with pulsing dot */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
          </span>
          <p className="text-sm text-cyan-400 font-medium">Processing your payout</p>
        </div>

        {/* Summary */}
        <p className="text-sm text-white/50">
          We&rsquo;re confirming your withdrawal. This usually takes a few minutes.
        </p>

        {/* Countdown */}
        <p className="text-yellow-400 font-semibold text-lg tabular-nums">
          ⏳ Available in {minutes}:{seconds.toString().padStart(2, "0")}
        </p>

        {/* Progress bar */}
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-1000 ease-linear"
            style={{
              width: `${percent}%`,
              background: percent > 90
                ? "linear-gradient(90deg, #22c55e, #4ade80)"
                : "linear-gradient(90deg, #06b6d4, #22d3ee)",
            }}
          />
        </div>

        <p className="text-xs text-white/45">Security check in progress</p>
      </div>
    </div>
  );
}
