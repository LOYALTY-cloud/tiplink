"use client";

import { useState, useEffect, useRef } from "react";
import type { LockReason } from "@/hooks/useAdminLock";

interface Props {
  lockReason: LockReason;
  onUnlock: (passcode: string) => Promise<{ ok: boolean; error?: string; logout?: boolean }>;
  adminName?: string;
  adminRole?: string;
}

const REASON_TEXT: Record<LockReason, { headline: string; sub: string }> = {
  idle:       { headline: "Session locked",         sub: "You were inactive for 5 minutes." },
  tab_switch: { headline: "Session locked",         sub: "Your session was locked when you left this tab." },
  manual:     { headline: "Session locked",         sub: "Your session has been manually locked." },
};

function initials(name: string): string {
  return name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export default function AdminLockScreen({ lockReason, onUnlock, adminName, adminRole }: Props) {
  const [passcode, setPasscode]   = useState("");
  const [show, setShow]           = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [attempts, setAttempts]   = useState(0);
  const inputRef                  = useRef<HTMLInputElement>(null);

  const { headline, sub } = REASON_TEXT[lockReason] ?? REASON_TEXT.idle;

  // Auto-focus only on non-touch devices — on mobile the keyboard popping
  // immediately while the lock overlay animates in is jarring
  useEffect(() => {
    const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!isTouchDevice) {
      const t = setTimeout(() => inputRef.current?.focus(), 180);
      return () => clearTimeout(t);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim() || loading) return;

    setLoading(true);
    setError("");

    const result = await onUnlock(passcode.trim());

    setLoading(false);

    if (result.ok) {
      setPasscode("");
      return;
    }

    // Server signals forced logout (rate limit exhausted)
    if (result.logout) {
      sessionStorage.clear();
      localStorage.removeItem("admin_session");
      localStorage.removeItem("admin_token");
      fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
      window.location.href = "/admin/login";
      return;
    }

    const next = attempts + 1;
    setAttempts(next);
    setError(result.error ?? "Invalid passcode");
    setPasscode("");
    inputRef.current?.focus();
  }

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto"
      style={{ backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", background: "rgba(5,8,18,0.92)" }}
    >
      {/* Gradient glow — decorative */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      {/* Scroll container — centres on desktop, anchors to top with padding on mobile */}
      <div className="relative min-h-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0B1220]/90 shadow-2xl p-6 sm:p-8 space-y-5">

            {/* Lock icon */}
            <div className="flex justify-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-2xl sm:text-3xl">
                🔒
              </div>
            </div>

            {/* Headline */}
            <div className="text-center space-y-1">
              <h1 className="text-lg sm:text-xl font-bold text-white">{headline}</h1>
              <p className="text-sm text-white/50">{sub}</p>
            </div>

            {/* Admin identity badge */}
            {adminName && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/8">
                <div className="w-9 h-9 rounded-full bg-indigo-600/60 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {initials(adminName)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{adminName}</p>
                  {adminRole && (
                    <p className="text-[11px] text-white/40 capitalize">{adminRole.replace("_", " ")}</p>
                  )}
                </div>
              </div>
            )}

            {/* Passcode form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type={show ? "text" : "password"}
                  value={passcode}
                  onChange={(e) => { setPasscode(e.target.value.toUpperCase()); setError(""); }}
                  placeholder="Enter your admin passcode"
                  autoComplete="current-password"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="done"
                  disabled={loading}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3.5 pr-14 text-white placeholder-white/25 text-base sm:text-sm font-mono tracking-widest focus:outline-none focus:border-indigo-500/60 transition disabled:opacity-50"
                />
                {/* Show/hide toggle — large tap target for mobile */}
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-0 top-0 h-full px-4 flex items-center justify-center text-white/30 hover:text-white/60 active:text-white/80 transition"
                  tabIndex={-1}
                  aria-label={show ? "Hide passcode" : "Show passcode"}
                >
                  <span className="text-lg">{show ? "🙈" : "👁"}</span>
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-xs px-1 leading-relaxed">
                  {error}
                  {attempts >= 3 && " — Too many failed attempts? Contact the owner."}
                </p>
              )}

              <button
                type="submit"
                disabled={!passcode.trim() || loading}
                className="w-full py-3.5 rounded-xl font-semibold text-base text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", boxShadow: "0 4px 24px rgba(99,102,241,0.35)" }}
              >
                {loading ? "Verifying…" : "Unlock Session"}
              </button>
            </form>

            {/* Logout option */}
            <div className="text-center">
              <button
                onClick={() => {
                  localStorage.removeItem("admin_session");
                  localStorage.removeItem("admin_token");
                  sessionStorage.clear();
                  fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
                  window.location.href = "/admin/login";
                }}
                className="text-sm sm:text-xs py-2 px-4 text-white/25 hover:text-white/50 active:text-white/70 transition"
              >
                Not you? Sign out
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[10px] text-white/20 mt-4 pb-[env(safe-area-inset-bottom)]">
            1neLink Admin · Protected Session
          </p>
        </div>
      </div>
    </div>
  );
}
