"use client";

import { useState } from "react";
import { ui } from "@/lib/ui";
import { REPORT_REASONS, type ReportReason } from "@/lib/marketplace/strikes";

interface Props {
  themeId: string;
  themeName: string;
  onClose: () => void;
}

export default function ReportThemeModal({ themeId, themeName, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!reason) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/marketplace/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, reason, details }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed to submit report.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className={`${ui.card} w-full max-w-lg p-6`}>
        {done ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-3">✅</div>
            <h2 className={ui.h2}>Report submitted</h2>
            <p className={`${ui.muted2} mt-2 text-sm`}>
              Our team will review &quot;{themeName}&quot; within 48 hours.
            </p>
            <button className={`${ui.btnPrimary} mt-6 w-full`} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className={`${ui.h2} mb-1`}>Report Theme</h2>
            <p className={`${ui.muted2} text-sm mb-6`}>{themeName}</p>

            <div className="space-y-4">
              <div>
                <label className={`${ui.label} block mb-2`}>Reason</label>
                <select
                  className={ui.select}
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                >
                  <option value="">Select a reason…</option>
                  {REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`${ui.label} block mb-2`}>Additional details (optional)</label>
                <textarea
                  className={`${ui.input} min-h-[90px] resize-none`}
                  placeholder="Provide any relevant links, descriptions, or evidence…"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button className={ui.btnGhost} onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                className={ui.btnPrimary}
                onClick={submit}
                disabled={!reason || loading}
              >
                {loading ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
