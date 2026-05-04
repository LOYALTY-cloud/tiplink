"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  generateFreezeExplanation,
  summarizeFreeze,
} from "@/lib/freezeExplanation";

interface FreezeBannerProps {
  freezeReason: string | null;
  freezeLevel: "soft" | "hard" | null;
  freezeSignals?: string[];
  onUnfrozen?: () => void;
}

export default function FreezeBanner({
  freezeReason,
  freezeLevel,
  freezeSignals,
  onUnfrozen,
}: FreezeBannerProps) {
  const [unfreezing, setUnfreezing] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isHard = freezeLevel === "hard";

  // Derive explanation bullets and summary from signals
  const explanations = useMemo(
    () => (freezeSignals?.length ? generateFreezeExplanation(freezeSignals) : []),
    [freezeSignals]
  );
  const summary = useMemo(
    () => (freezeSignals?.length ? summarizeFreeze(freezeSignals) : null),
    [freezeSignals]
  );

  const handleUnfreeze = async () => {
    if (!password.trim()) {
      setError("Enter your password to verify");
      return;
    }

    setUnfreezing(true);
    setError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setError("Please log in again");
        setUnfreezing(false);
        return;
      }

      const res = await fetch("/api/account/unfreeze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Unfreeze failed");
        setUnfreezing(false);
        return;
      }

      setSuccess(true);
      setPassword("");
      onUnfrozen?.();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setUnfreezing(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
        <p className="text-emerald-400 font-semibold">✅ Account restored</p>
        <p className="text-xs text-emerald-400/70">
          Your withdrawals are now enabled.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-2xl border space-y-3 ${
        isHard
          ? "bg-red-500/10 border-red-500/20"
          : "bg-amber-500/10 border-amber-500/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{isHard ? "🔴" : "⚠️"}</span>
        <div className="space-y-1">
          <p
            className={`font-semibold ${
              isHard ? "text-red-400" : "text-amber-400"
            }`}
          >
            {isHard
              ? "Account restricted — review required"
              : "Withdrawals temporarily paused"}
          </p>

          {/* Smart summary + bullet explanations */}
          {summary ? (
            <p className="text-sm text-white/60">{summary}</p>
          ) : (
            <p className="text-sm text-white/60">
              {freezeReason ?? "Suspicious activity detected"}
            </p>
          )}

          {explanations.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {explanations.map((e, i) => (
                <p key={i} className="text-xs text-white/50">• {e}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {isHard ? (
          <Link
          href="/dashboard/support"
          className="inline-block text-sm font-medium text-red-400 hover:text-red-300 underline underline-offset-2"
        >
          Contact support →
          </Link>
      ) : (
        <>
          {!showPasswordInput ? (
            <button
              onClick={() => setShowPasswordInput(true)}
              className="w-full py-2.5 rounded-xl bg-amber-500/20 text-amber-400 font-medium text-sm hover:bg-amber-500/30 transition"
            >
              Verify & Unlock
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnfreeze()}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.12] text-white text-sm outline-none focus:border-amber-400/40 placeholder:text-white/45"
              />
              <button
                onClick={handleUnfreeze}
                disabled={unfreezing}
                className="w-full py-2.5 rounded-xl bg-amber-500/20 text-amber-400 font-medium text-sm hover:bg-amber-500/30 transition disabled:opacity-50"
              >
                {unfreezing ? "Verifying…" : "Confirm & Unlock"}
              </button>
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
