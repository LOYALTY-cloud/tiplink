"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ui } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) return setMsg(data.error ?? "Something went wrong.");
      setMsg("Password reset link sent. Check your email.");
    } catch {
      setLoading(false);
      setMsg("Something went wrong. Please try again.");
    }
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
