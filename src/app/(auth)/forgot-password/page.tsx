"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);
    if (error) return setMsg(error.message);
    setMsg("Password reset link sent. Check your email.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className={`${ui.card} w-full max-w-md p-6 space-y-4`}>
        <div className="mb-4">
          <div className={ui.h2}>Forgot password</div>
        </div>

        <input
          className={ui.input}
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button className={`${ui.btnPrimary} w-full`} disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </button>

        {msg && <p className="text-sm opacity-80">{msg}</p>}

        <p className="text-sm">
          <Link className="underline" href="/login">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}
