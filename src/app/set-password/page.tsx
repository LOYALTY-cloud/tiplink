"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const COMMON_PASSWORDS = [
  "password",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "password1",
  "iloveyou",
  "sunshine1",
  "princess1",
  "football1",
  "trustno1",
  "superman1",
  "whatever1",
  "welcome1",
  "password123",
  "qwertyui",
  "asdfghjk",
  "p@ssw0rd",
  "passw0rd",
  "admin123",
  "welcome123",
  "changeme",
];

export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tokenHash = useMemo(() => searchParams.get("token_hash"), [searchParams]);
  const token = useMemo(() => searchParams.get("token"), [searchParams]);
  const setupToken = useMemo(() => searchParams.get("setup_token"), [searchParams]);
  const type = useMemo(() => searchParams.get("type") ?? "recovery", [searchParams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setErr(null);
      setVerifying(true);

      if (setupToken) {
        setReady(true);
        setVerifying(false);
        return;
      }

      // Primary path: Supabase action_link verifies token and establishes session
      // before redirecting to this page.
      const { data: initialSession } = await supabase.auth.getSession();
      if (cancelled) return;
      if (initialSession.session) {
        setReady(true);
        setVerifying(false);
        return;
      }

      const incomingToken = tokenHash || token;

      if (incomingToken && type === "recovery") {
        const { data, error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: incomingToken,
        });

        if (cancelled) return;

        if (error || !data?.session) {
          setErr("Set-password link is invalid or expired. Please request a new link.");
          setVerifying(false);
          setReady(false);
          return;
        }

        setReady(true);
        setVerifying(false);
        return;
      }

      // Final fallback retry in case session cookies are still propagating.
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionData.session) {
        setReady(true);
        setVerifying(false);
        return;
      }

      setErr("Set-password link is invalid or expired. Please request a new link.");
      setVerifying(false);
      setReady(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [setupToken, tokenHash, token, type]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (!/[a-z]/.test(password)) {
      setErr("Password must include a lowercase letter.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setErr("Password must include an uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setErr("Password must include a number.");
      return;
    }
    if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
      setErr("This password is too common. Choose something stronger.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);

    if (setupToken) {
      const res = await fetch("/api/auth/set-password/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken, password }),
      });

      const body = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok) {
        setErr(body?.error || "Unable to set password. Please request a new link.");
        return;
      }
    } else {
      const { error } = await supabase.auth.updateUser({ password });
      setLoading(false);

      if (error) {
        setErr(error.message);
        return;
      }
    }

    fetch("/api/auth/password-changed", { method: "POST" }).catch(() => {});

    setMsg("Password updated successfully. Redirecting to login...");
    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#060B18]">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-white/5 p-6">
        <div className="flex flex-col items-center mb-2">
          <img src="/1nelink-logo.png" alt="1neLink" className="h-14 w-auto object-contain mb-3" />
        </div>

        <h1 className="text-xl font-semibold text-white">Set your password</h1>
        <p className="mt-1 text-sm text-white/60">Create a password for your new 1neLink creator account.</p>

        {verifying && (
          <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-100">
            Verifying your secure link...
          </div>
        )}

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
              className="mt-2 w-full rounded-xl border border-white/[0.12] bg-white/5 px-3 py-3 text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
              className="mt-2 w-full rounded-xl border border-white/[0.12] bg-white/5 px-3 py-3 text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !ready || verifying}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
