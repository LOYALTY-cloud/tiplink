"use client";

import { useState } from "react";

export default function VerifyEmailBanner({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function resend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, user_id: userId }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
    } catch {
      setError("Could not send verification email. Try again later.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center justify-between gap-3">
      <span>
        📧 Please verify your email to unlock withdrawals and payouts.
        {sent && <span className="ml-2 text-green-400">Verification email sent!</span>}
        {error && <span className="ml-2 text-red-400">{error}</span>}
      </span>
      {!sent && (
        <button
          onClick={resend}
          disabled={sending}
          className="shrink-0 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-100 transition disabled:opacity-50"
        >
          {sending ? "Sending…" : "Resend verification"}
        </button>
      )}
    </div>
  );
}
