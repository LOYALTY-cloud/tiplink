"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onStay: () => void;
}

const COUNTDOWN_SEC = 60; // matches IDLE_LOCK_MS - WARN_MS in useAdminLock

export default function SessionWarningModal({ open, onStay }: Props) {
  const [seconds, setSeconds] = useState(COUNTDOWN_SEC);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Start / reset countdown whenever the modal opens
  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current);
      setSeconds(COUNTDOWN_SEC);
      return;
    }

    setSeconds(COUNTDOWN_SEC);
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [open]);

  function handleStay() {
    clearInterval(intervalRef.current);
    setSeconds(COUNTDOWN_SEC);
    onStay();
  }

  if (!open) return null;

  // Colour the ring based on urgency
  const urgent = seconds <= 15;
  const ringColor = urgent ? "#ef4444" : seconds <= 30 ? "#f97316" : "#6366f1";
  const pct = (seconds / COUNTDOWN_SEC) * 100;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(5,8,18,0.70)", backdropFilter: "blur(6px)" }}
    >
      {/* Bottom-sheet on mobile, centred card on sm+ */}
      <div
        className="w-full sm:max-w-sm sm:mx-4 sm:mb-0 sm:rounded-2xl rounded-t-3xl border-t sm:border border-white/12 p-6 space-y-5 shadow-2xl"
        style={{
          background: "#0B1220",
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* Countdown ring + icon */}
        <div className="flex justify-center">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              {/* Track */}
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
              {/* Progress */}
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke={ringColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-xl font-bold tabular-nums ${urgent ? "text-red-400" : "text-white"}`}>
                {seconds}
              </span>
              <span className="text-[9px] text-white/30 uppercase tracking-wide">sec</span>
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="text-center space-y-1">
          <h2 className="text-base font-semibold text-white">Session expiring soon</h2>
          <p className="text-sm text-white/50">
            {seconds > 0
              ? `Your session will lock in ${seconds} second${seconds !== 1 ? "s" : ""} due to inactivity.`
              : "Your session is being locked now…"}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleStay}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              boxShadow: "0 4px 20px rgba(99,102,241,0.35)",
            }}
          >
            Stay Logged In
          </button>
          <button
            onClick={() => {
              clearInterval(intervalRef.current);
              localStorage.removeItem("admin_session");
              localStorage.removeItem("admin_token");
              sessionStorage.clear();
              fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
              window.location.href = "/admin/login";
            }}
            className="w-full py-3 rounded-xl text-sm text-white/30 hover:text-white/50 active:text-white/70 transition"
          >
            Log out now
          </button>
        </div>
      </div>
    </div>
  );
}
