"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/dashboard"), 1200);
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
              className="h-32 sm:h-36 drop-shadow-[0_0_20px_rgba(0,224,255,0.4)]"
            />
          </div>

          {/* Success state */}
          {success ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">👋</div>
              <h2 className="text-xl text-emerald-400 font-semibold">Welcome back</h2>
              <p className="text-gray-400 mt-2 text-sm">Redirecting to dashboard...</p>
            </div>
          ) : (
            <>
              {/* Title */}
              <h1 className="text-2xl font-semibold text-white text-center">
                Log in
              </h1>
              <p className="text-sm text-gray-400 text-center mb-6">
                Welcome back to 1neLink.
              </p>

              {/* Inputs with glow */}
              <div className="space-y-4">
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
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400
                    focus:outline-none focus:border-purple-400
                    focus:shadow-[0_0_12px_rgba(168,85,247,0.4)]
                    transition-all duration-200"
                />
              </div>

              {/* Error */}
              {msg && <p className="text-sm text-red-400 mt-3">{msg}</p>}

              {/* Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-purple-500 text-white font-medium
                  hover:opacity-90 active:scale-[0.97] transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Log in"}
              </button>

              {/* Links */}
              <div className="flex justify-between mt-4 text-sm text-gray-400">
                <Link href="/forgot-password" className="hover:text-white transition">
                  Forgot password?
                </Link>
                <Link href="/signup" className="hover:text-white transition">
                  Create account
                </Link>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
