"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

const REASONS = [
  { value: "fraud",          label: "Fraud / Scam" },
  { value: "impersonation",  label: "Impersonation" },
  { value: "stolen_content", label: "Stolen / Copied Content" },
  { value: "payment_abuse",  label: "Payment Abuse / Chargeback Fraud" },
  { value: "spam",           label: "Spam" },
  { value: "harassment",     label: "Harassment" },
  { value: "inappropriate",  label: "Inappropriate Content" },
  { value: "fake_tips",      label: "Fake Tips / Fake Support" },
  { value: "payout_abuse",   label: "Payout Abuse" },
  { value: "other",          label: "Other" },
];

const TARGET_TYPES = [
  { value: "user",        label: "User" },
  { value: "creator",     label: "Creator" },
  { value: "transaction", label: "Transaction" },
  { value: "theme",       label: "Theme" },
];

export function ReportContentModal() {
  const [open, setOpen]               = useState(false);
  const [targetType, setTargetType]   = useState("user");
  const [targetHandle, setTargetHandle] = useState("");
  const [reason, setReason]           = useState("");
  const [details, setDetails]         = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [submitted, setSubmitted]     = useState(false);

  function reset() {
    setTargetType("user");
    setTargetHandle("");
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
    if (!targetHandle.trim()) { setError("Enter a @handle or ID"); return; }
    if (!reason) { setError("Please select a reason"); return; }
    setLoading(true);
    setError("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setError("You must be logged in to submit a report"); setLoading(false); return; }

      const evidenceUrls = evidenceInput
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean)
        .slice(0, 5);

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_type:   targetType,
          target_handle: targetHandle.trim(),
          reason,
          details:       details.trim() || null,
          evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
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
      {/* Card trigger */}
      <button
        onClick={() => { reset(); setOpen(true); }}
        className={`${ui.card} w-full px-5 py-4 hover:bg-white/[0.08] transition group text-left flex items-center gap-4`}
      >
        <span className="text-2xl">🚩</span>
        <div>
          <p className="font-semibold text-white group-hover:text-red-200 transition">
            Report Content or User
          </p>
          <p className={`text-sm ${ui.muted}`}>
            Report fraud, impersonation, stolen content, or abuse
          </p>
        </div>
        <span className="ml-auto text-white/45 group-hover:text-white/60 transition">→</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className={`${ui.card} w-full max-w-md p-6 space-y-4`}>
            {submitted ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-3xl">✅</p>
                <h2 className={ui.h2}>Report submitted</h2>
                <p className={`text-sm ${ui.muted2}`}>
                  Our moderation team will review this shortly. Thank you for helping keep 1neLink safe.
                </p>
                <button onClick={close} className={`${ui.btnPrimary} w-full mt-2`}>Done</button>
              </div>
            ) : (
              <>
                <div>
                  <h2 className={`${ui.h2} text-base`}>🚩 Report Content or User</h2>
                  <p className={`text-xs ${ui.muted2} mt-0.5`}>
                    Reports go directly to our moderation team.
                  </p>
                </div>

                {/* What are you reporting? */}
                <div>
                  <label className={`text-sm ${ui.muted} mb-1 block`}>What are you reporting?</label>
                  <div className="flex gap-2 flex-wrap">
                    {TARGET_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setTargetType(t.value)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                          targetType === t.value
                            ? "bg-blue-500/20 text-blue-300 border-blue-400/40"
                            : "bg-white/5 text-white/50 border-white/10 hover:border-white/20"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* @handle or ID input */}
                <div>
                  <label className={`text-sm ${ui.muted} mb-1 block`}>
                    {targetType === "user" || targetType === "creator"
                      ? `@handle of the ${targetType} you're reporting *`
                      : targetType === "transaction"
                      ? "Transaction ID (UUID) *"
                      : targetType === "theme"
                      ? "Theme ID (UUID) *"
                      : "ID (UUID) *"}
                  </label>
                  <input
                    value={targetHandle}
                    onChange={(e) => setTargetHandle(e.target.value)}
                    className={ui.input}
                    placeholder={
                      targetType === "user" || targetType === "creator"
                        ? "@username"
                        : "Paste the UUID here"
                    }
                  />
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
                  <label className={`text-sm ${ui.muted} mb-1 block`}>
                    Details <span className="text-white/30">(optional)</span>
                  </label>
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
                    Evidence links <span className="text-white/30">(optional, one per line)</span>
                  </label>
                  <textarea
                    value={evidenceInput}
                    onChange={(e) => setEvidenceInput(e.target.value)}
                    className={`${ui.input} min-h-[55px] text-xs font-mono`}
                    placeholder={"https://example.com/screenshot.png"}
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={close} className={`${ui.btnGhost} flex-1`}>Cancel</button>
                  <button
                    onClick={submit}
                    disabled={loading || !targetHandle.trim() || !reason}
                    className={`${ui.btnPrimary} flex-1`}
                  >
                    {loading ? "Submitting…" : "Submit Report"}
                  </button>
                </div>

                <p className={`text-[10px] ${ui.muted2} text-center`}>
                  False or malicious reports may result in action against your account.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
