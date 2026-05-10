"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import StripeVerificationModal from "@/components/StripeVerificationModal";

type RequirementsPayload = {
  connected: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  needs_verification: boolean;
  currently_due: string[];
  currently_due_labels?: string[];
  future_due: string[];
  future_due_labels?: string[];
  pending_verification?: string[];
  pending_verification_labels?: string[];
  disabled_reason?: string | null;
  last_notified_at?: string | null;
};

export default function StripeRequirementsCenter() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RequirementsPayload | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void loadRequirements();
    const interval = setInterval(() => {
      void loadRequirements();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadRequirements() {
    try {
      setError(null);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/stripe/requirements", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load requirements");

      setData(json as RequirementsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requirements");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-4">
        <p className="text-sm text-red-200">{error}</p>
      </div>
    );
  }

  if (!data?.connected || !data.needs_verification) {
    return null;
  }

  const currentLabels = (data.currently_due_labels?.length ? data.currently_due_labels : data.currently_due).slice(0, 5);
  const futureLabels = (data.future_due_labels?.length ? data.future_due_labels : data.future_due).slice(0, 3);
  const pendingLabels = (data.pending_verification_labels?.length ? data.pending_verification_labels : data.pending_verification ?? []).slice(0, 3);

  return (
    <>
      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 mb-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-amber-100">Verification Requirements Center</h3>
            <p className="text-sm text-amber-100/80 mt-1">
              Your payout account needs updates before payouts can continue normally.
            </p>
          </div>
          <div className="text-xs text-amber-200/80">
            {data.payouts_enabled ? "Payouts active" : "Payouts limited"}
          </div>
        </div>

        {data.disabled_reason && (
          <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-amber-200/80">Disabled reason</p>
            <p className="text-sm text-amber-100 mt-1">{data.disabled_reason}</p>
          </div>
        )}

        {currentLabels.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-200/80 mb-1">Currently required</p>
            <ul className="space-y-1">
              {currentLabels.map((item) => (
                <li key={`current-${item}`} className="text-sm text-amber-100/90">• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {futureLabels.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-200/80 mb-1">Future requirements</p>
            <ul className="space-y-1">
              {futureLabels.map((item) => (
                <li key={`future-${item}`} className="text-sm text-amber-100/90">• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {pendingLabels.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-200/80 mb-1">Pending verification</p>
            <ul className="space-y-1">
              {pendingLabels.map((item) => (
                <li key={`pending-${item}`} className="text-sm text-amber-100/90">• {item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition"
          >
            Complete verification
          </button>
          <button
            onClick={() => void loadRequirements()}
            className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-sm font-semibold transition"
          >
            Refresh
          </button>
        </div>
      </div>

      <StripeVerificationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onComplete={() => {
          void loadRequirements();
        }}
      />
    </>
  );
}
