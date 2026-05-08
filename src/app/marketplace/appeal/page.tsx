"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ui } from "@/lib/ui";

export default function AppealPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const themeId = searchParams.get("themeId");

  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!themeId) {
    return (
      <div className={`${ui.page} flex items-center justify-center p-6`}>
        <div className={`${ui.card} max-w-md w-full p-8 text-center`}>
          <p className={ui.muted2}>No theme specified. Go to your dashboard and appeal from a flagged theme.</p>
          <button className={`${ui.btnGhost} mt-6 w-full`} onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`${ui.page} flex items-center justify-center p-6`}>
        <div className={`${ui.card} max-w-md w-full p-8 text-center`}>
          <div className="text-4xl mb-4">📬</div>
          <h1 className={ui.h1}>Appeal submitted</h1>
          <p className={`${ui.muted2} mt-3 text-sm`}>
            Our moderation team will review your appeal and respond within 3–5 business days.
          </p>
          <button className={`${ui.btnPrimary} mt-6 w-full`} onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError("Please provide a detailed reason (at least 10 characters).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/marketplace/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Submission failed. Please try again.");
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
    <div className={`${ui.page} p-4 sm:p-6`}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-white/50 hover:text-white text-sm mb-4 flex items-center gap-1 transition"
          >
            ← Back
          </button>
          <h1 className={ui.h1}>Appeal Theme Decision</h1>
          <p className={`${ui.muted2} mt-2 text-sm`}>
            Explain why this theme was incorrectly flagged or removed. Be specific — vague appeals are
            less likely to be approved.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={`${ui.card} p-6 space-y-5`}>
          <div>
            <label className={`${ui.label} block mb-2`}>Your Appeal *</label>
            <textarea
              className={`${ui.input} min-h-[180px] resize-none`}
              placeholder="Describe why this theme complies with marketplace rules, that it does not contain copyrighted logos or brand marks, and any other relevant context…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              required
            />
            <p className={`${ui.muted2} text-xs mt-1 text-right`}>
              {reason.length}/2000
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <div className={`${ui.cardInner} p-4 text-xs ${ui.muted2} space-y-1`}>
            <p className="font-semibold text-white/70">Before submitting:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Remove all brand logos, trademarks, or copyrighted characters</li>
              <li>Ensure your theme name and description have no misleading keywords</li>
              <li>Repeated or abusive appeals may result in an upload ban</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading || reason.trim().length < 10}
            className={`${ui.btnPrimary} w-full`}
          >
            {loading ? "Submitting…" : "Submit Appeal"}
          </button>
        </form>
      </div>
    </div>
  );
}
