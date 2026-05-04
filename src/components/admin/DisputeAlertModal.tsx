"use client";

import Link from "next/link";

type DisputeAlertData = {
  receipt_id: string;
  amount: number;
  creator_id: string;
  severity: "low" | "medium" | "high";
  reason?: string;
  event: "new_dispute" | "dispute_resolved" | "dispute_countered" | "approval_needed";
};

const eventLabel: Record<DisputeAlertData["event"], string> = {
  new_dispute: "New Dispute Alert",
  dispute_resolved: "Dispute Resolved",
  dispute_countered: "Dispute Countered",
  approval_needed: "Approval Needed",
};

const eventIcon: Record<DisputeAlertData["event"], string> = {
  new_dispute: "🚨",
  dispute_resolved: "✅",
  dispute_countered: "⚔️",
  approval_needed: "🔐",
};

const severityBorder: Record<DisputeAlertData["severity"], string> = {
  high: "border-red-400/30",
  medium: "border-yellow-400/30",
  low: "border-emerald-400/30",
};

const severityBadge: Record<DisputeAlertData["severity"], string> = {
  high: "bg-red-500/10 text-red-400 border-red-400/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-400/20",
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-400/20",
};

export default function DisputeAlertModal({
  data,
  onClose,
}: {
  data: DisputeAlertData;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        className={`w-[90%] max-w-md p-6 rounded-2xl bg-[#0B0F1A] border ${severityBorder[data.severity]} shadow-xl animate-in fade-in zoom-in`}
      >
        <p className="text-red-400 text-sm font-semibold flex items-center gap-1.5">
          <span>{eventIcon[data.event]}</span>
          {eventLabel[data.event]}
        </p>

        <p className="text-xl font-semibold text-white mt-2">
          ${data.amount.toFixed(2)}
        </p>

        <p className="text-sm text-gray-400 mt-1">
          Creator: <span className="text-gray-300 font-mono">{data.creator_id.slice(0, 12)}…</span>
        </p>

        {data.reason && (
          <p className="text-xs text-gray-500 mt-1">
            Reason: {data.reason}
          </p>
        )}

        <div className="mt-3">
          <span
            className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border ${severityBadge[data.severity]}`}
          >
            {data.severity.toUpperCase()}
          </span>
        </div>

        <div className="mt-5 flex gap-2">
          <Link
            href="/admin/disputes"
            className={`flex-1 text-center py-2 rounded-lg text-sm font-medium ${
              data.event === "approval_needed"
                ? "bg-yellow-500/10 border border-yellow-400/20 text-yellow-400"
                : "bg-red-500/10 border border-red-400/20 text-red-400"
            }`}
          >
            {data.event === "approval_needed" ? "Review Approval" : "View Dispute"}
          </Link>

          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-white/5 border border-white/[0.12] text-white text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
