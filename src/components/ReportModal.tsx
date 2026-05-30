"use client";

import { useState } from "react";
import { ui } from "@/lib/ui";

type ReportModalProps = {
  targetType: "creator" | "user" | "transaction" | "theme" | "post" | "comment";
  targetId: string;
  targetOwnerId?: string | null;
  targetName?: string;
  /** Bearer token for the logged-in user */
  authToken: string | null;
  /** Optional trigger element — defaults to a small "Report" button */
  trigger?: React.ReactNode;
};

const REASONS = [
  { value: "fraud",          label: "Fraud / Scam" },
  { value: "impersonation",  label: "Impersonation" },
  { value: "stolen_content", label: "Stolen / Copied Content" },
  { value: "payment_abuse",  label: "Payment Abuse / Chargeback Fraud" },
  { value: "inappropriate",  label: "Inappropriate Content" },
  { value: "fake_tips",      label: "Fake Tips / Fake Support" },
  { value: "other",          label: "Other" },
];

export function ReportModal({
  targetType,
  targetId,
  targetOwnerId,
  targetName,
  authToken,
  trigger,
}: ReportModalProps) {
  const [open, setOpen]           = useState(false);
  const [reason, setReason]       = useState("");
  const [details, setDetails]     = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [submitted, setSubmitted] = useState(false);

  function reset() {
    setReason("");
    setDetails("");
    setEvidenceInput("");
    setError("");
    setSubmitted(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function submit() {
    if (!reason) { setError("Please select a reason"); return; }
    if (!authToken) { setError("You must be logged in to report"); return; }
    setLoading(true);
    setError("");
    try {
      const evidenceUrls = evidenceInput
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean)
        .slice(0, 5);

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          target_type:     targetType,
          target_id:       targetId,
          target_owner_id: targetOwnerId ?? null,
          reason,
          details:         details.trim() || null,
          evidence_urls:   evidenceUrls.length > 0 ? evidenceUrls : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit report");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Trigger */}
      <span onClick={() => { if (!open) { reset(); setOpen(true); } }}>
        {trigger ?? (
          <button className="text-xs text-white/30 hover:text-red-400 transition">
            Report
          </button>
        )}
      </span>

      {/* Modal Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className={`${ui.card} w-full max-w-md p-6 space-y-4`}>
            {submitted ? (
              // Success state
              <div className="text-center py-4 space-y-3">
                <p className="text-3xl">✅</p>
                <h2 className={ui.h2}>Report submitted</h2>
                <p className={`text-sm ${ui.muted2}`}>
                  Our moderation team will review this. Thank you for helping keep the platform safe.
                </p>
                <button onClick={close} className={`${ui.btnPrimary} w-full mt-2`}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div>
                  <h2 className={`${ui.h2} text-base`}>
                    Report {targetName ? `"${targetName}"` : targetType}
                  </h2>
                  <p className={`text-xs ${ui.muted2} mt-0.5 capitalize`}>
                    {targetType} · ID {targetId.slice(0, 8)}…
                  </p>
                </div>

                {/* Reason */}
                <div>
                  <label className={`text-sm ${ui.muted} mb-1 block`}>Reason *</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className={ui.select}
                  >
                    <option value="">Select a reason…</option>
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* Details */}
                <div>
                  <label className={`text-sm ${ui.muted} mb-1 block`}>Details <span className="text-white/30">(optional)</span></label>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    maxLength={2000}
                    className={`${ui.input} min-h-[80px] text-sm`}
                    placeholder="Describe what happened…"
                  />
                  <p className={`text-[10px] ${ui.muted2} mt-0.5 text-right`}>{details.length}/2000</p>
                </div>

                {/* Evidence URLs */}
                <div>
                  <label className={`text-sm ${ui.muted} mb-1 block`}>
                    Evidence URLs <span className="text-white/30">(optional, one per line)</span>
                  </label>
                  <textarea
                    value={evidenceInput}
                    onChange={(e) => setEvidenceInput(e.target.value)}
                    className={`${ui.input} min-h-[60px] text-xs font-mono`}
                    placeholder={"https://example.com/screenshot.png\nhttps://…"}
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={close} className={`${ui.btnGhost} flex-1`}>
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={loading || !reason}
                    className={`${ui.btnPrimary} flex-1`}
                  >
                    {loading ? "Submitting…" : "Submit Report"}
                  </button>
                </div>

                <p className={`text-[10px] ${ui.muted2} text-center`}>
                  Reports are reviewed by our moderation team. False reports may result in account action.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
