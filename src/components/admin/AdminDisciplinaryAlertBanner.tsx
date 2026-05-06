"use client";

import { useState } from "react";
import type { PendingDisciplinaryReport } from "@/hooks/useDisciplinaryReports";

type AdminDisciplinaryAlertBannerProps = {
  alerts: PendingDisciplinaryReport[];
  loading: boolean;
  busyId: string | null;
  acknowledge: (alert: PendingDisciplinaryReport) => Promise<boolean>;
};

export default function AdminDisciplinaryAlertBanner({
  alerts,
  loading,
  busyId,
  acknowledge,
}: AdminDisciplinaryAlertBannerProps) {
  const [open, setOpen] = useState(false);

  // Never return null — always render a stable wrapper so that the DOM height
  // doesn't change when alerts appear/disappear (prevents content below jumping).
  return (
    <>
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: alerts.length > 0 ? "64px" : "0px" }}
        aria-live="polite"
      >
        {alerts.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-2 rounded-lg flex items-center justify-between">
            <span className="text-sm">
              ⚠️ You have {alerts.length} disciplinary report{alerts.length > 1 ? "s" : ""} pending acknowledgement.
            </span>
            <button
              onClick={() => setOpen(true)}
              className="text-sm underline hover:text-red-200 transition"
            >
              View
            </button>
          </div>
        </div>
      )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#0b1220] p-5 space-y-4 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Disciplinary Reports</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/50 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-white/50">Loading alerts...</p>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-white/50">No pending disciplinary reports.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {alerts.map((a) => (
                  <div key={a.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-red-200">{a.title || "Disciplinary Report Issued"}</p>
                      <span className="text-[11px] text-white/40">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-white/80 whitespace-pre-wrap">{a.reason || "No message"}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/50 uppercase tracking-wide">
                        {a.ticket_status === "acknowledged" ? "Acknowledged" : "Pending acknowledgment"}
                      </span>
                      <button
                        type="button"
                        onClick={() => acknowledge(a)}
                        disabled={!a.ticket_id || !!busyId || a.ticket_status === "acknowledged"}
                        className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {busyId === a.id ? "Processing..." : "Acknowledge"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <p className="text-xs text-white/50">Acknowledgment is required to continue.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
