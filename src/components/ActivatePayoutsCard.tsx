"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ActivatePayoutsCard({
  payoutsEnabled,
  stripeAccountId,
  userId,
}: {
  payoutsEnabled: boolean;
  stripeAccountId: string | null;
  userId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);

    const { data: sessionRes } = await supabase.auth.getSession();
    const token = sessionRes.session?.access_token;

    if (!token) {
      setLoading(false);
      alert("Please log in again.");
      return;
    }

    const res = await fetch("/api/stripe/connect/onboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      alert(data?.error || "Failed to start Stripe onboarding");
      return;
    }

    window.location.href = data.url; // redirect to Stripe
  }

  async function handleSync() {
    setLoading(true);
    const res = await fetch("/api/stripe/connect/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    setLoading(false);

    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || "Could not verify Stripe status");
      return;
    }

    // simplest: reload to refresh server data
    window.location.reload();
  }

  if (payoutsEnabled) {
    return (
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-emerald-200">✅ Payouts active</div>
            <div className="mt-1 text-white/80">
              Your account can receive tips and withdraw to bank.
            </div>
            <div className="mt-2 text-xs text-white/55">
              Connected: {stripeAccountId ? stripeAccountId : "Stripe"}
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={loading}
            className="shrink-0 rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-white/90 disabled:opacity-60"
          >
            {loading ? "Checking..." : "Re-check"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-emerald-200">Activate payouts</div>
          <div className="mt-1 text-white/80">
            Connect Stripe to start receiving tips and withdraw money.
          </div>
          <div className="mt-2 text-xs text-white/55">
            Secure onboarding • US creators • Takes a few minutes
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading}
          className="shrink-0 rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-white/90 disabled:opacity-60"
        >
          {loading ? "Opening..." : "Connect now"}
        </button>
      </div>
    </div>
  );
}
