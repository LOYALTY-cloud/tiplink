"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [handleErr, setHandleErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleRe = /^[a-zA-Z0-9_]{3,30}$/;

  const onHandleChange = (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setHandle(cleaned);
    setHandleErr(null);
    if (cleaned && !handleRe.test(cleaned)) {
      setHandleErr("3-30 characters, letters/numbers/underscores only");
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setHandleErr(null);
    setLoading(true);

    if (!displayName.trim()) {
      setLoading(false);
      return setErr("Display name is required.");
    }
    if (!handle || !handleRe.test(handle)) {
      setLoading(false);
      return setHandleErr("Handle must be 3-30 characters, letters/numbers/underscores only.");
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName: displayName.trim(), handle }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        if (data.field === "handle") return setHandleErr(data.error);
        return setErr(data.error ?? "Something went wrong.");
      }

      setMsg("Account created! Check your email to confirm.");
    } catch {
      setLoading(false);
      setErr("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050816] relative overflow-hidden px-4">

      {/* Animated background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute w-[500px] h-[500px] bg-cyan-500/20 blur-[120px] top-[-100px] left-[-100px] animate-pulse" />
        <div className="absolute w-[500px] h-[500px] bg-purple-600/20 blur-[120px] bottom-[-100px] right-[-100px] animate-pulse" />
      </div>

      {/* Card — fade + slide up on mount */}
      <div
        className={`relative z-10 w-full max-w-md transform transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <form
          onSubmit={onSubmit}
          className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 shadow-xl"
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="/1nelink-logo.png"
              alt="1neLink"
              className="h-16 sm:h-18 md:h-20 w-auto object-contain drop-shadow-[0_0_15px_rgba(0,224,255,0.4)]"
            />
          </div>

          {/* Success state */}
          {msg ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">🎉</div>
              <h2 className="text-xl text-emerald-400 font-semibold">You&apos;re in!</h2>
              <p className="text-gray-400 mt-2 text-sm">{msg}</p>
              <Link
                href="/login"
                className="inline-block mt-4 px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-medium hover:opacity-90 active:scale-[0.97] transition-all duration-200"
              >
                Log in
              </Link>
            </div>
          ) : (
            <>
              {/* Title */}
              <h1 className="text-2xl font-semibold text-white text-center">
                Create your account
              </h1>
              <p className="text-sm text-gray-400 text-center mb-6">
                Start receiving tips in minutes.
              </p>

              {/* Inputs with glow */}
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={50}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400
                    focus:outline-none focus:border-cyan-400
                    focus:shadow-[0_0_12px_rgba(0,224,255,0.4)]
                    transition-all duration-200"
                />

                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">@</span>
                    <input
                      type="text"
                      placeholder="handle"
                      value={handle}
                      onChange={(e) => onHandleChange(e.target.value)}
                      required
                      maxLength={30}
                      className="w-full pl-7 pr-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400
                        focus:outline-none focus:border-cyan-400
                        focus:shadow-[0_0_12px_rgba(0,224,255,0.4)]
                        transition-all duration-200"
                    />
                  </div>
                  {handleErr && <p className="text-xs text-red-400 mt-1">{handleErr}</p>}
                  {handle && !handleErr && <p className="text-xs text-gray-500 mt-1">1nelink.com/{handle}</p>}
                </div>

                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400
                    focus:outline-none focus:border-cyan-400
                    focus:shadow-[0_0_12px_rgba(0,224,255,0.4)]
                    transition-all duration-200"
                />

                <input
                  type="password"
                  placeholder="Password (min 8 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400
                    focus:outline-none focus:border-purple-400
                    focus:shadow-[0_0_12px_rgba(168,85,247,0.4)]
                    transition-all duration-200"
                />
              </div>

              {/* Error */}
              {err && <p className="text-sm text-red-400 mt-3">{err}</p>}

              {/* Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-medium
                  hover:opacity-90 active:scale-[0.97] transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Sign up"}
              </button>

              {/* Link */}
              <p className="text-sm text-gray-400 text-center mt-4">
                Already have an account?{" "}
                <Link href="/login" className="text-white hover:text-cyan-400 transition">
                  Log in
                </Link>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
