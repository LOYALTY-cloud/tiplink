"use client";

import { useEffect, useRef, useState } from "react";
import CircleProgress from "./CircleProgress";
import { formatMoney } from "@/lib/walletFees";
import { supabase } from "@/lib/supabase/client";

type GoalData = {
  amount: number;
  period: "day" | "week" | "month";
  duration: number;
  startDate: string;
};

type Props = {
  goal: GoalData;
  goalEarnings: number;
  onDelete: () => void;
  onComplete: () => void;
};

export default function GoalActive({ goal, goalEarnings, onDelete, onComplete }: Props) {
  const progress = Math.min((goalEarnings / goal.amount) * 100, 100);
  const remaining = Math.max(goal.amount - goalEarnings, 0);

  // Smooth animated progress
  const [animatedProgress, setAnimatedProgress] = useState(0);
  useEffect(() => {
    setAnimatedProgress(progress);
  }, [progress]);

  // Completion detection + feedback (fires once via ref)
  const [completed, setCompleted] = useState(false);
  const hasMarkedComplete = useRef(false);

  useEffect(() => {
    if (hasMarkedComplete.current) return;
    if (goalEarnings >= goal.amount) {
      hasMarkedComplete.current = true;
      setCompleted(true);

      // Haptic
      navigator.vibrate?.([50, 30, 50]);

      // Sound
      const audio = new Audio("/sounds/success.mp3");
      audio.play().catch(() => {});

      // Mark complete in DB + notify parent
      markGoalComplete();
    }
  }, [goalEarnings, goal.amount]);

  async function markGoalComplete() {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    await fetch("/api/goals/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Clear from UI after 3s celebration
    setTimeout(() => onComplete(), 3000);
  }

  // Days remaining until goal end
  const start = new Date(goal.startDate);
  const endDate = new Date(start);
  if (goal.period === "day") endDate.setDate(start.getDate() + goal.duration);
  else if (goal.period === "week") endDate.setDate(start.getDate() + goal.duration * 7);
  else endDate.setMonth(start.getMonth() + goal.duration);
  const daysLeft = Math.max(Math.ceil((endDate.getTime() - Date.now()) / 86_400_000), 0);

  // 3-dot menu
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      await fetch("/api/goals/delete", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onDelete();
    } finally {
      setDeleting(false);
      setMenuOpen(false);
    }
  }

  return (
    <div
      className={`bg-white/5 border border-white/10 rounded-2xl p-5 text-center relative transition-all duration-500 ${
        completed ? "shadow-[0_0_30px_rgba(34,197,94,0.4)]" : ""
      }`}
    >
      {/* Menu */}
      <div className="absolute top-4 right-4" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="text-white/40 hover:text-white/70 transition text-lg leading-none px-1"
        >
          ⋮
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-white/10 rounded-lg shadow-lg z-30 overflow-hidden">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-white/5 transition"
            >
              {deleting ? "Deleting…" : "🗑 Delete Goal"}
            </button>
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-white font-semibold mb-4">🎯 Goal Earnings</h3>

      {/* Circle */}
      <div className={`flex justify-center mb-4 transition-transform duration-500 ${completed ? "scale-110" : ""}`}>
        <CircleProgress progress={animatedProgress} />
      </div>

      {/* Amount */}
      <p className="text-white text-xl font-semibold">
        {formatMoney(goalEarnings)} / {formatMoney(goal.amount)}
      </p>

      {/* Remaining / Completed */}
      {completed ? (
        <p className="text-emerald-400 text-sm font-semibold mt-2 animate-pulse">🎉 Goal reached!</p>
      ) : (
        <p className="text-white/50 text-sm mt-1">
          {formatMoney(remaining)} left
        </p>
      )}

      {/* Time remaining */}
      <p className="text-white/40 text-xs mt-2">
        {daysLeft > 0 ? `Ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Goal period ended"}
      </p>
    </div>
  );
}
