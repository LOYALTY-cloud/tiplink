"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // Try to detect a session from the URL (recovery link flow)
        try {
          // some versions expose a helper to parse session from the URL
          // use a safe any cast so TypeScript doesn't complain if it's not present
          // @ts-expect-error - optional helper may not exist on this client version
          const parsed = await (supabase.auth as unknown).getSessionFromUrl?.();
          if (parsed?.data?.session) return;
        } catch (e) {
          // ignore and fallthrough to show error
        }

        setErr("Reset link is invalid or expired. Please request a new one.");
      }
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

    setMsg("Password updated. You can close this page and sign in.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#060B18]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold text-white">Reset password</h1>
        <p className="mt-1 text-sm text-white/60">Enter a new password for your TIPLINKME account.</p>

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
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

