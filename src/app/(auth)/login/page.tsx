"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Clear any stale session lock from a previous session

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

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className={`${ui.card} w-full max-w-md p-6 space-y-4`}>
        <div className="mb-4 flex flex-col items-center text-center">
          <img src="/1nelink-logo.png" alt="1neLink" className="h-16 w-16 rounded-xl object-contain mb-3" />
          <div className={ui.h2}>Log in</div>
          <div className={ui.muted}>Welcome back to 1NELINK.</div>
        </div>

        <input
          className={ui.input}
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          className={ui.input}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button className={`${ui.btnPrimary} w-full`} disabled={loading}>
          {loading ? "Signing in..." : "Log in"}
        </button>

        {msg && <p className="text-sm text-red-400">{msg}</p>}

        <div className="flex items-center justify-between text-sm">
          <Link className="underline" href="/forgot-password">
            Forgot password?
          </Link>
          <Link className="underline" href="/signup">
            Create account
          </Link>
        </div>
      </form>
    </div>
  );
}
