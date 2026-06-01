"use client";

import { useState, useEffect, useRef } from "react";
import type { UserLockReason } from "@/hooks/useUserLock";
import { supabase } from "@/lib/supabase/client";

interface Props {
  lockReason: UserLockReason;
  onUnlock: (password: string) => Promise<{ ok: boolean; error?: string }>;
  email?: string;
}

const REASON_TEXT: Record<UserLockReason, { headline: string; sub: string }> = {
  idle:       { headline: "Session locked", sub: "You were inactive for 5 minutes." },
  tab_switch: { headline: "Session locked", sub: "Your session was locked when you left this tab." },
  manual:     { headline: "Session locked", sub: "Your session has been manually locked." },
};

export default function UserLockScreen({ lockReason, onUnlock, email }: Props) {
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [attempts, setAttempts] = useState(0);
  const inputRef                = useRef<HTMLInputElement>(null);

  const { headline, sub } = REASON_TEXT[lockReason] ?? REASON_TEXT.idle;

  // Auto-focus on non-touch devices
  useEffect(() => {
    const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!isTouchDevice) {
      const t = setTimeout(() => inputRef.current?.focus(), 180);
      return () => clearTimeout(t);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError("");

    const result = await onUnlock(password);
    setLoading(false);

    if (result.ok) {
      setPassword("");
      return;
    }

    const next = attempts + 1;
    setAttempts(next);
    setError(result.error ?? "Incorrect password");
    setPassword("");
    inputRef.current?.focus();
  }

  async function handleSignOut() {
    localStorage.removeItem("user_lock_reason");
    localStorage.removeItem("user_last_active");
    for (const key of ["supabase.auth.token", "supabase.auth.token.0", "supabase.auth.token.1"]) {
      document.cookie = `${key}=; path=/; max-age=0; samesite=lax`;
    }
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto"
      style={{
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        background: "rgba(5,8,18,0.92)",
      }}
    >
      {/* Decorative glow */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      <div className="relative min-h-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0B1220]/90 shadow-2xl p-6 sm:p-8 space-y-5">

            {/* Lock icon */}
            <div className="flex justify-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-2xl sm:text-3xl">
                🔒
              </div>
            </div>

            {/* Headline */}
            <div className="text-center space-y-1">
              <h1 className="text-lg sm:text-xl font-bold text-white">{headline}</h1>
              <p className="text-sm text-white/50">{sub}</p>
            </div>

            {/* User identity badge */}
            {email && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/[0.08]">
                <div className="w-9 h-9 rounded-full bg-purple-600/60 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {email[0]?.toUpperCase() ?? "U"}
                </div>
                <p className="text-sm text-white truncate">{email}</p>
              </div>
            )}

            {/* Password form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={loading}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3.5 pr-14 text-white placeholder-white/25 text-base sm:text-sm focus:outline-none focus:border-purple-500/60 transition disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-0 top-0 h-full px-4 flex items-center justify-center text-white/30 hover:text-white/60 active:text-white/80 transition"
                  tabIndex={-1}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  <span className="text-lg">{show ? "🙈" : "👁"}</span>
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-xs px-1 leading-relaxed">
                  {error}
                  {attempts >= 5 && " — Forgotten your password? Sign out and reset it."}
                </p>
              )}

              <button
                type="submit"
                disabled={!password.trim() || loading}
                className="w-full py-3.5 rounded-xl font-semibold text-base text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #9333ea, #7c3aed)",
                  boxShadow: "0 4px 24px rgba(147,51,234,0.35)",
                }}
              >
                {loading ? "Verifying…" : "Unlock Session"}
              </button>
            </form>

            {/* Sign out option */}
            <div className="text-center">
              <button
                onClick={handleSignOut}
                className="text-sm sm:text-xs py-2 px-4 text-white/25 hover:text-white/50 active:text-white/70 transition"
              >
                Not you? Sign out
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] text-white/20 mt-4 pb-[env(safe-area-inset-bottom)]">
            1neLink · Protected Session
          </p>
        </div>
      </div>
    </div>
  );
}
