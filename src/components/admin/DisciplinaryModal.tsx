"use client";

import { useEffect } from "react";
import type { PendingDisciplinaryReport } from "@/hooks/useDisciplinaryReports";

type DisciplinaryModalProps = {
  reports: PendingDisciplinaryReport[];
  loading: boolean;
  busyId: string | null;
  markAsRead: (report: PendingDisciplinaryReport) => Promise<boolean>;
  acknowledge: (report: PendingDisciplinaryReport) => Promise<boolean>;
};

export default function DisciplinaryModal({
  reports,
  loading,
  busyId,
  markAsRead,
  acknowledge,
}: DisciplinaryModalProps) {

  const locked = reports.length > 0;

  useEffect(() => {
    if (!locked) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);

  function severityClass(severity: string) {
    if (severity === "policy_violation") return "text-red-300 border-red-500/30 bg-red-500/10";
    if (severity === "escalation") return "text-orange-300 border-orange-500/30 bg-orange-500/10";
    return "text-yellow-200 border-yellow-500/25 bg-yellow-500/10";
  }

  if (loading || !locked) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-[#0B1220] border border-red-500/20 rounded-2xl p-6 space-y-5 shadow-2xl">
        <div>
          <h2 className="text-lg font-semibold text-red-400">Disciplinary Notice</h2>
          <p className="text-sm text-white/60 mt-1">
            You must review and acknowledge each report before continuing.
          </p>
        </div>

        <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
          {reports.map((r) => (
            <div key={r.id} className={`border rounded-lg p-3 ${severityClass(r.severity)}`}>
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-sm text-white mt-1 whitespace-pre-wrap">{r.reason}</p>
              <p className="text-[11px] text-white/40 mt-1">
                {new Date(r.created_at).toLocaleString()}
              </p>
              <p className="text-[11px] text-white/50 mt-1">
                {r.read_at ? "Read confirmed" : "Read required before acknowledgment"}
              </p>

              <button
                type="button"
                onClick={() => markAsRead(r)}
                disabled={busyId !== null || !r.ticket_id || !!r.read_at}
                className="mt-3 w-full bg-white/10 hover:bg-white/15 rounded-lg py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {r.read_at ? "Read" : "Mark as Read"}
              </button>

              <button
                type="button"
                onClick={() => acknowledge(r)}
                disabled={busyId !== null || !r.ticket_id || !r.read_at}
                className="mt-3 w-full bg-red-600 hover:bg-red-500 rounded-lg py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busyId === r.id ? "Processing..." : "Acknowledge"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
