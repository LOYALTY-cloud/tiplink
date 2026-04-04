"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // The auth callback already exchanged the code and set the session in cookies.
      // Check for session — also listen for auth state changes in case
      // the Supabase client is still processing.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
            setReady(true);
          }
        }
      );

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        // Give auto-detection a moment to complete, then show error
        setTimeout(async () => {
          const { data: retry } = await supabase.auth.getSession();
          if (retry.session) {
            setReady(true);
          } else {
            setErr("Reset link is invalid or expired. Please request a new one.");
          }
        }, 2000);
      }

      return () => subscription.unsubscribe();
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    // Send password-changed confirmation email (non-blocking)
    fetch("/api/auth/password-changed", { method: "POST" }).catch(() => {});

    setMsg("Password updated. You can close this page and sign in.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#060B18]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col items-center mb-2">
          <img src="/1nelink-logo.png" alt="1neLink" className="h-16 w-16 rounded-xl object-contain mb-3" />
        </div>
        <h1 className="text-xl font-semibold text-white">Reset password</h1>
        <p className="mt-1 text-sm text-white/60">Enter a new password for your 1NELINK account.</p>

        {err && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
        )}
        {msg && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{msg}</div>
        )}

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div>
            <label className="text-xs text-white/60">New password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="text-xs text-white/60">Confirm password</label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !ready}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

