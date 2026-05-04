"use client";

import { useState, useCallback } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type AICaseAnalysis = {
  summary: string;
  risk_level: "low" | "medium" | "high";
  signals: string[];
  explanation: string[];
  suggested_actions: string[];
};

const SIGNAL_LABELS: Record<string, { label: string; icon: string }> = {
  new_device: { label: "New device detected", icon: "📱" },
  rapid_withdrawal: { label: "Rapid withdrawal", icon: "⚡" },
  high_velocity: { label: "High transaction velocity", icon: "🔄" },
  repeat_disputes: { label: "Repeat disputes", icon: "🔁" },
  ip_change: { label: "IP address change", icon: "🌐" },
  multiple_cards: { label: "Multiple cards used", icon: "💳" },
  new_account: { label: "New account", icon: "🆕" },
  large_amount: { label: "Large amount", icon: "💰" },
  unusual_time: { label: "Unusual time", icon: "🌙" },
  prior_restriction: { label: "Prior restriction", icon: "🚫" },
  pending_payout: { label: "Pending payout", icon: "⏳" },
  refund_requested: { label: "Refund requested", icon: "↩️" },
  anonymous_tip: { label: "Anonymous tip", icon: "👤" },
};

const RISK_STYLES = {
  low: {
    badge: "text-green-400 bg-green-500/10 border-green-400/20",
    glow: "border-green-400/15",
    icon: "🟢",
    label: "LOW RISK",
  },
  medium: {
    badge: "text-yellow-400 bg-yellow-500/10 border-yellow-400/20",
    glow: "border-yellow-400/15",
    icon: "🟡",
    label: "MEDIUM RISK",
  },
  high: {
    badge: "text-red-400 bg-red-500/10 border-red-400/20",
    glow: "border-red-400/15",
    icon: "🔴",
    label: "HIGH RISK",
  },
};

type Props = {
  receiptId: string;
};

export default function AICasePanel({ receiptId }: Props) {
  const [analysis, setAnalysis] = useState<AICaseAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const runAnalysis = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/disputes/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ receipt_id: receiptId, force_refresh: forceRefresh }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Analysis failed");
      }

      const json = await res.json();
      setAnalysis(json.analysis);
      setCached(json.cached ?? false);
      setUpdatedAt(json.updated_at ?? null);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  // Collapsed state — just the trigger button
  if (!expanded && !analysis) {
    return (
      <button
        onClick={() => runAnalysis()}
        disabled={loading}
        className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-400/20 text-purple-400 hover:bg-purple-500/20 transition-all disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Analyzing…
          </>
        ) : (
          <>🧠 AI Analysis</>
        )}
      </button>
    );
  }

  const risk = analysis ? RISK_STYLES[analysis.risk_level] : null;

  return (
    <div className={`mt-4 rounded-xl border ${risk?.glow ?? "border-white/[0.12]"} bg-gradient-to-br from-white/[0.03] to-white/0 backdrop-blur-xl overflow-hidden transition-all duration-300`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🧠</span>
          <span className="text-sm font-semibold text-white">AI Case Analysis</span>
          {risk && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${risk.badge}`}>
              {risk.icon} {risk.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cached && (
            <span className="text-[10px] text-gray-500">cached</span>
          )}
          {updatedAt && (
            <span className="text-[10px] text-gray-500">
              {new Date(updatedAt).toLocaleTimeString()}
            </span>
          )}
          <span className="text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg text-xs bg-red-500/10 border border-red-400/20 text-red-400">
              {error}
            </div>
          )}

          {analysis && (
            <>
              {/* Summary */}
              <div>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">Summary</p>
                <p className="text-sm text-gray-200 leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Signals */}
              {analysis.signals.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">Signals Detected</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.signals.map((s) => {
                      const info = SIGNAL_LABELS[s] ?? { label: s, icon: "⚠️" };
                      return (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/[0.12] text-gray-300"
                        >
                          <span>{info.icon}</span>
                          {info.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Explanation */}
              {analysis.explanation.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">Risk Explanation</p>
                  <ul className="space-y-1.5">
                    {analysis.explanation.map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-yellow-400 mt-0.5 shrink-0">•</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggested Actions */}
              {analysis.suggested_actions.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-2">Suggested Actions</p>
                  <ul className="space-y-1.5">
                    {analysis.suggested_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Disclaimer */}
              <div className="pt-2 border-t border-white/5">
                <p className="text-[10px] text-gray-600 italic">
                  AI-generated analysis for reference only. Admin review and judgment required for all actions.
                </p>
              </div>

              {/* Refresh */}
              <div className="flex justify-end">
                <button
                  onClick={() => runAnalysis(true)}
                  disabled={loading}
                  className="text-[11px] px-3 py-1.5 rounded-md bg-white/5 border border-white/[0.12] text-gray-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                >
                  {loading ? "Refreshing…" : "↻ Refresh Analysis"}
                </button>
              </div>
            </>
          )}

          {!analysis && !error && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500">Analysis unavailable — review this case manually.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
