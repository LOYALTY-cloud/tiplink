"use client";

import { useEffect, useState } from "react";
import StripeVerificationModal from "./StripeVerificationModal";
import { supabase } from "@/lib/supabase/client";

interface VerificationStatus {
  needs_verification: boolean;
  requirements: string[];
  charge_enabled: boolean;
  payouts_enabled: boolean;
}

export default function StripeVerificationCard() {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    checkStatus();
    // Refresh every 30 seconds in case Stripe updated
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkStatus() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch("/api/stripe/connect/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;
      const data = await res.json();

      // Fetch full account to get requirements
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_account_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id || "")
        .maybeSingle();

      // For now, just show high-level status
      setStatus({
        needs_verification: !(data.charges_enabled && data.payouts_enabled),
        requirements: [],
        charge_enabled: data.charges_enabled || false,
        payouts_enabled: data.payouts_enabled || false,
      });
    } catch (e) {
      console.error("Failed to check verification status:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !status?.needs_verification) {
    return null;
  }

  return (
    <>
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-amber-100">
              ⚠️ Verification Needed
            </h3>
            <p className="text-sm text-amber-100/80 mt-1">
              Your payout account requires additional verification to continue receiving tips and payments.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition"
              >
                Complete Verification
              </button>
              <button
                onClick={checkStatus}
                className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-sm font-semibold transition"
              >
                Refresh Status
              </button>
            </div>
          </div>
        </div>
      </div>

      <StripeVerificationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onComplete={checkStatus}
      />
    </>
  );
}
