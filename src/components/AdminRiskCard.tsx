"use client";

import { ui } from "@/lib/ui";
import { buildRiskSummary } from "@/lib/fraudExplain";

type AdminRiskCardProps = {
  trust_score: number;
  risk_level: "low" | "medium" | "high" | string;
  risk_reasons?: string[];
  last_risk_check?: string | null;
  is_frozen?: boolean;
  freeze_reason?: string | null;
  is_flagged?: boolean;
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-red-400",
};

const RISK_BG: Record<string, string> = {
  low: "bg-green-500/10 border-green-500/20",
  medium: "bg-yellow-500/10 border-yellow-500/20",
  high: "bg-red-500/10 border-red-500/20",
};

export default function AdminRiskCard({
  trust_score,
  risk_level,
  risk_reasons,
  last_risk_check,
  is_frozen,
  freeze_reason,
  is_flagged,
}: AdminRiskCardProps) {
  const color = RISK_COLORS[risk_level] ?? RISK_COLORS.medium;
  const bg = RISK_BG[risk_level] ?? RISK_BG.medium;

  const summary = buildRiskSummary({
    trust_score,
    risk_level,
    is_frozen: !!is_frozen,
    freeze_reason,
    is_flagged,
  });

  return (
    <div className={`${ui.card} p-5 border ${bg}`}>
      {/* Freeze banner */}
      {is_frozen && (
        <div className="bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span className="text-red-400 text-sm">🔒</span>
          <div>
            <p className="text-red-400 text-xs font-semibold">Account Frozen</p>
            {freeze_reason && (
              <p className="text-red-300/70 text-[10px]">{freeze_reason}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Trust &amp; Risk Profile</h3>
        <span className={`font-bold text-sm uppercase ${color}`}>
          {risk_level}
        </span>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <span className={`text-3xl font-bold ${color}`}>
          {trust_score}
        </span>
        <span className={`text-sm ${ui.muted2} mb-1`}>/100</span>
      </div>

      {/* Score bar */}
      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            risk_level === "low"
              ? "bg-green-500"
              : risk_level === "medium"
              ? "bg-yellow-500"
              : "bg-red-500"
          }`}
          style={{ width: `${Math.max(2, trust_score)}%` }}
        />
      </div>

      {/* AI explanation summary */}
      {summary.explanation && summary.severity !== "clear" && (
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
          summary.severity === "danger"
            ? "bg-red-500/10 border-red-500/20 text-red-400"
            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
        }`}>
          {summary.explanation}
        </div>
      )}

      {/* Risk reasons */}
      {risk_reasons && risk_reasons.length > 0 && (
        <div className={`mt-3 text-xs ${ui.muted} space-y-1`}>
          {risk_reasons.map((r, i) => (
            <p key={i}>• {r}</p>
          ))}
        </div>
      )}

      {last_risk_check && (
        <p className={`mt-2 text-[10px] ${ui.muted2}`}>
          Last checked: {new Date(last_risk_check).toLocaleString()}
        </p>
      )}
    </div>
  );
}
