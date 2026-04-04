"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !passcode.trim()) return;
    setError(null);
    setLoading(true);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, passcode }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      setError(data.error ?? "Login failed");
      setLoading(false);
      return;
    }

    // Store admin session with 8-hour expiry
    localStorage.setItem("admin_session", JSON.stringify({
      ...data.session,
      expires_at: Date.now() + 8 * 60 * 60 * 1000,
    }));

    setLoading(false);
    router.push("/admin");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
      <form
        onSubmit={handleLogin}
        className="bg-white/5 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">Admin Login</h1>
          <p className="text-white/40 text-sm mt-1">Enter your name and passcode</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-black border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 outline-none focus:border-white/20 transition"
          />
          <input
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-black border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 outline-none focus:border-white/20 transition"
          />
        </div>

        <input
          type="password"
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          required
          className="w-full px-3 py-2.5 bg-black border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 outline-none focus:border-white/20 transition font-mono tracking-wider"
        />

        <button
          type="submit"
          disabled={loading || !firstName.trim() || !lastName.trim() || !passcode.trim()}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black py-2.5 rounded-xl font-medium text-sm transition"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
