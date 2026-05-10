"use client";

import { useEffect, useRef, useState } from "react";
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
  disabled_reason_label?: string | null;
  last_notified_at?: string | null;
};

export default function StripeRequirementsCenter() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RequirementsPayload | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const aggressivePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void loadRequirements();
    const interval = setInterval(() => void loadRequirements(), 30000);
    return () => {
      clearInterval(interval);
      if (aggressivePollRef.current) clearInterval(aggressivePollRef.current);
    };
  }, []);

  async function loadRequirements(manual = false) {
    if (manual) setRefreshing(true);
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
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requirements");
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }

  function handleVerificationComplete() {
    setSubmittedAt(new Date());
    setModalOpen(false);
    void loadRequirements();
    // Poll every 10s for 90s so users see updates as Stripe processes their submission
    if (aggressivePollRef.current) clearInterval(aggressivePollRef.current);
    let count = 0;
    aggressivePollRef.current = setInterval(() => {
      count++;
      void loadRequirements();
      if (count >= 9) {
        clearInterval(aggressivePollRef.current!);
        aggressivePollRef.current = null;
      }
    }, 10000);
  }

  if (loading) return null;
  if (error) return null;

  // After submission, if requirements are now clear show a success card
  if (submittedAt && (!data?.connected || !data.needs_verification)) {
    return (
      <div className="rounded-2xl border border-green-400/25 bg-green-500/10 p-4 mb-4 space-y-2">
        <h3 className="font-semibold text-green-100">Verification complete</h3>
        <p className="text-sm text-green-100/80">
          Your information was submitted and your Stripe account is now verified. Payouts are enabled.
        </p>
      </div>
    );
  }

  if (!data?.connected || !data.needs_verification) {
    return null;
  }

  const currentLabels = (data.currently_due_labels?.length ? data.currently_due_labels : data.currently_due).slice(0, 5);
  const futureLabels = (data.future_due_labels?.length ? data.future_due_labels : data.future_due).slice(0, 3);
  const pendingLabels = (data.pending_verification_labels?.length ? data.pending_verification_labels : data.pending_verification ?? []).slice(0, 3);
  const payoutsRestricted = Boolean(data.disabled_reason) || !data.payouts_enabled;
  const hasSupportReviewPending = pendingLabels.some((item) => item.includes("Stripe Support review"));
  const hasTosRequirement = data.currently_due.some((f) => f.startsWith("tos_acceptance"));

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
          <div className="text-xs text-amber-200/80 shrink-0">
            {payoutsRestricted ? "Payouts limited" : "Payouts active"}
          </div>
        </div>

        {/* Post-submission processing banner */}
        {submittedAt && (
          <div className="rounded-lg border border-blue-300/30 bg-blue-500/10 px-3 py-2">
            <p className="text-sm text-blue-200 font-medium">Information submitted — Stripe is reviewing it</p>
            <p className="text-xs text-blue-200/80 mt-1">
              This can take a few minutes. The status below will update automatically as Stripe processes your submission.
            </p>
          </div>
        )}

        {data.disabled_reason && (
          <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-amber-200/80">Disabled reason</p>
            <p className="text-sm text-amber-100 mt-1">{data.disabled_reason_label || data.disabled_reason}</p>
            {data.disabled_reason === "rejected.terms_of_service" ? (
              <p className="text-xs text-amber-200/85 mt-2">
                This status is usually resolved through Stripe Support review. Keep your onboarding details accurate and contact support if this status does not clear.
              </p>
            ) : null}
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
            {hasTosRequirement && (
              <p className="text-xs text-amber-200/80 mt-2">
                To accept Stripe&apos;s Terms of Service, click <strong className="text-amber-100">Complete verification</strong> below and follow the steps in the form.
              </p>
            )}
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
            {hasSupportReviewPending ? (
              <p className="text-xs text-amber-200/85 mt-2">
                One or more items are under Stripe Support review and may require waiting for Stripe's decision.
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition"
          >
            Complete verification
          </button>
          <button
            onClick={() => void loadRequirements(true)}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 text-amber-100 text-sm font-semibold transition"
          >
            {refreshing ? "Checking..." : "Refresh status"}
          </button>
          {lastRefreshed && (
            <span className="text-xs text-amber-200/60 ml-auto">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <StripeVerificationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onComplete={handleVerificationComplete}
      />
    </>
  );
}
