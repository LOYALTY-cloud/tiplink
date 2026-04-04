"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ui } from "@/lib/ui";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [handleErr, setHandleErr] = useState<string | null>(null);

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className={`${ui.card} w-full max-w-md p-6 space-y-4`}>
        <div className="mb-4 flex flex-col items-center text-center">
          <img src="/1nelink-logo.png" alt="1neLink" className="h-16 w-16 rounded-xl object-contain mb-3" />
          <div className={ui.h2}>Create 1NELINK account</div>
        </div>

        <div>
          <input
            className={ui.input}
            placeholder="Display Name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={50}
          />
        </div>

        <div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">@</span>
            <input
              className={`${ui.input} pl-7`}
              placeholder="handle"
              type="text"
              value={handle}
              onChange={(e) => onHandleChange(e.target.value)}
              required
              maxLength={30}
            />
          </div>
          {handleErr && <p className="text-xs text-red-400 mt-1">{handleErr}</p>}
          {handle && !handleErr && <p className="text-xs text-white/40 mt-1">1nelink.com/{handle}</p>}
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

        {err && <p className="text-sm text-red-400">{err}</p>}
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
