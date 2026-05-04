"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
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
  const [handleOk, setHandleOk] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [mounted, setMounted] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRef = useRef(handle);

  useEffect(() => { setMounted(true); }, []);

  const handleRe = /^[a-zA-Z0-9_]{3,30}$/;
  const passwordValid =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password);

  const checkHandle = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setHandleOk(false);
    setSuggestions([]);
    handleRef.current = value;

    if (!value || !handleRe.test(value)) return;

    setChecking(true);
    const checkingValue = value;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-handle?handle=${encodeURIComponent(checkingValue)}`);
        const data = await res.json();
        // Only update if the handle hasn't changed while we were fetching
        if (handleRef.current !== checkingValue) return;
        if (data.available) {
          setHandleErr(null);
          setHandleOk(true);
          setSuggestions([]);
        } else {
          setHandleErr(data.error || "Handle is taken");
          setHandleOk(false);
          setSuggestions(data.suggestions ?? []);
        }
      } catch {
        // Silent fail — server validation will catch it on submit
      } finally {
        setChecking(false);
      }
    }, 400);
  };

  const onHandleChange = (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setHandle(cleaned);
    setHandleErr(null);
    setHandleOk(false);
    setSuggestions([]);
    if (cleaned && !handleRe.test(cleaned)) {
      setHandleErr("3-30 characters, letters/numbers/underscores only");
    } else if (cleaned.length >= 3) {
      checkHandle(cleaned);
    }
  };

  const pickSuggestion = (s: string) => {
    setHandle(s);
    setHandleErr(null);
    setHandleOk(false);
    setSuggestions([]);
    checkHandle(s);
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
        if (data.field === "handle") {
          setHandleErr(data.error);
          if (data.suggestions?.length) setSuggestions(data.suggestions);
          return;
        }
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
          className="bg-white/5 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-8 shadow-xl"
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
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/[0.12] text-white placeholder-gray-400
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
                      className={`w-full pl-7 pr-10 py-3 rounded-lg bg-white/5 border text-white placeholder-gray-400
                        focus:outline-none transition-all duration-200 ${
                          handleErr
                            ? "border-red-400/50 focus:border-red-400 focus:shadow-[0_0_12px_rgba(255,80,80,0.3)]"
                            : handleOk
                              ? "border-emerald-400/50 focus:border-emerald-400 focus:shadow-[0_0_12px_rgba(0,255,150,0.3)]"
                              : "border-white/[0.12] focus:border-cyan-400 focus:shadow-[0_0_12px_rgba(0,224,255,0.4)]"
                        }`}
                    />
                    {/* Status indicator */}
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                      {checking ? (
                        <span className="text-gray-500 animate-pulse">⏳</span>
                      ) : handleOk ? (
                        <span className="text-emerald-400">✓</span>
                      ) : handleErr ? (
                        <span className="text-red-400">✗</span>
                      ) : null}
                    </span>
                  </div>
                  {handleErr && <p className="text-xs text-red-400 mt-1">{handleErr}</p>}
                  {handleOk && <p className="text-xs text-emerald-400 mt-1">✓ 1nelink.com/{handle} is available</p>}
                  {!handleErr && !handleOk && handle && handle.length >= 3 && !checking && (
                    <p className="text-xs text-gray-500 mt-1">1nelink.com/{handle}</p>
                  )}

                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/[0.12]">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Try these instead</p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => pickSuggestion(s)}
                            className="text-xs px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 hover:bg-cyan-500/20 transition"
                          >
                            @{s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/[0.12] text-white placeholder-gray-400
                    focus:outline-none focus:border-cyan-400
                    focus:shadow-[0_0_12px_rgba(0,224,255,0.4)]
                    transition-all duration-200"
                />

                <div>
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/[0.12] text-white placeholder-gray-400
                      focus:outline-none focus:border-purple-400
                      focus:shadow-[0_0_12px_rgba(168,85,247,0.4)]
                      transition-all duration-200"
                  />
                  {password.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {[
                        { label: "8+ characters", ok: password.length >= 8 },
                        { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
                        { label: "Lowercase letter", ok: /[a-z]/.test(password) },
                        { label: "Number", ok: /[0-9]/.test(password) },
                      ].map(({ label, ok }) => (
                        <span key={label} className={`text-xs flex items-center gap-1 ${ok ? "text-emerald-400" : "text-gray-500"}`}>
                          {ok ? "✓" : "○"} {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {err && <p className="text-sm text-red-400 mt-3">{err}</p>}

              {/* Button */}
              <button
                type="submit"
                disabled={loading || !passwordValid}
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
