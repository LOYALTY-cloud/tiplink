"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const redirectBase = process.env.NEXT_PUBLIC_SITE_URL;
    const signUpOptions = redirectBase ? { options: { emailRedirectTo: `${redirectBase}/verify/callback` } } : {};

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...signUpOptions,
    });

    setLoading(false);
    if (error) return setMsg(error.message);
    setMsg("Check your email to confirm your account.");

    // If Supabase returned a user id immediately, request server to create card and wallet
    try {
      const userId = (data as { user?: { id?: string } } | null)?.user?.id;
      if (userId) {
        await fetch('/api/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, email }),
        }).catch(() => {});
      }
    } catch (err) {
      // non-fatal: signup succeeded, we'll still prompt to confirm email
      console.warn('createUserWithCard failed', err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className={`${ui.card} w-full max-w-md p-6 space-y-4`}>
        <div className="mb-4">
          <div className={ui.h2}>Create TIPLINK account</div>
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
          minLength={8}
        />

        <button className={`${ui.btnPrimary} w-full`} disabled={loading}>
          {loading ? "Creating..." : "Sign up"}
        </button>

        {msg && <p className="text-sm opacity-80">{msg}</p>}

        <p className="text-sm">
          Already have an account? {" "}
          <Link className="underline" href="/login">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
