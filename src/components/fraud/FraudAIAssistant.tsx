"use client";

import { useState } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";
import { generateFraudExplanation, buildRiskSummary, effectiveRiskLevel, type FraudExplainInput } from "@/lib/fraudExplain";

type AnalysisResult = {
  userId: string;
  handle: string | null;
  explanation: string;
  severity: "clear" | "warning" | "danger";
  reasons: string[];
  trustScore: number;
  riskLevel: string;
  isFrozen: boolean;
};

export default function FraudAIAssistant() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyzeUser() {
    const trimmed = query.trim().replace(/^@/, "");
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    // Try lookup by handle first, then by user_id prefix
    let profile: Record<string, unknown> | null = null;

    const { data: byHandle } = await supabase
      .from("profiles")
      .select(
        "user_id, handle, display_name, trust_score, risk_level, is_frozen, freeze_reason, is_flagged, account_status"
      )
      .eq("handle", trimmed)
      .limit(1)
      .maybeSingle();

    if (byHandle) {
      profile = byHandle;
    } else {
      // Try by user_id (partial match via ilike for convenience)
      const { data: byId } = await supabase
        .from("profiles")
        .select(
          "user_id, handle, display_name, trust_score, risk_level, is_frozen, freeze_reason, is_flagged, account_status"
        )
        .ilike("user_id", `${trimmed}%`)
        .limit(1)
        .maybeSingle();

      if (byId) profile = byId;
    }

    if (!profile) {
      setError(`No user found for "${trimmed}"`);
      setLoading(false);
      return;
    }

    // Fetch recent anomalies for context
    const { data: anomalies } = await supabase
      .from("fraud_anomalies")
      .select("type, score, decision, flags, reason, created_at")
      .eq("user_id", profile.user_id as string)
      .order("created_at", { ascending: false })
      .limit(10);

    const hasChargeback = (anomalies ?? []).some(
      (a) => a.flags?.includes("chargeback") || a.type === "chargeback"
    );
    const hasMultiAccount = (anomalies ?? []).some(
      (a) => a.flags?.includes("multi_account") || a.type === "multi_account"
    );
    const hasActivitySpike = (anomalies ?? []).some(
      (a) => a.flags?.includes("activity_spike") || a.type === "velocity_spike"
    );
    const hasRapidWithdrawals = (anomalies ?? []).some(
      (a) => a.flags?.includes("rapid_withdrawals")
    );

    const input: FraudExplainInput = {
      trust_score: (profile.trust_score as number) ?? 50,
      risk_level: (profile.risk_level as string) ?? "low",
      is_frozen: (profile.is_frozen as boolean) ?? false,
      freeze_reason: profile.freeze_reason as string | null,
      is_flagged: (profile.is_flagged as boolean) ?? false,
      recent_chargeback: hasChargeback,
      multi_account_flag: hasMultiAccount,
      activity_spike: hasActivitySpike,
      rapid_withdrawals: hasRapidWithdrawals,
    };

    const fullExplanation = generateFraudExplanation(input);
    const summary = buildRiskSummary(input);

    setResult({
      userId: profile.user_id as string,
      handle: profile.handle as string | null,
      explanation: fullExplanation,
      severity: summary.severity,
      reasons: summary.reasons,
      trustScore: (profile.trust_score as number) ?? 50,
      riskLevel: effectiveRiskLevel(
        (profile.risk_level as string) ?? "low",
        { is_flagged: (profile.is_flagged as boolean) ?? false, is_frozen: (profile.is_frozen as boolean) ?? false, trust_score: (profile.trust_score as number) ?? 50 }
      ),
      isFrozen: (profile.is_frozen as boolean) ?? false,
    });

    setLoading(false);
  }

  return (
    <div className={`${ui.card} ${ui.cardInner} p-5 space-y-4`}>
      <h2 className={`${ui.h2} text-lg`}>AI Fraud Assistant</h2>
      <p className={`${ui.muted} text-sm`}>
        Enter a handle or user ID to generate a risk analysis.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyzeUser()}
          placeholder="@handle or user ID…"
          className={ui.input}
        />
        <button
          onClick={analyzeUser}
          disabled={loading || !query.trim()}
          className={`${ui.btnPrimary} ${ui.btnSmall} whitespace-nowrap`}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/15 border border-red-500/40 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* User header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">
                {result.handle ? `@${result.handle}` : result.userId.slice(0, 12) + "…"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  result.riskLevel === "high" ? "text-red-400 bg-red-500/10" :
                  result.riskLevel === "medium" ? "text-yellow-400 bg-yellow-500/10" :
                  "text-green-400 bg-green-500/10"
                }`}>
                  {result.riskLevel} risk
                </span>
                {result.isFrozen && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full text-red-400 bg-red-500/10">
                    🔒 Frozen
                  </span>
                )}
              </div>
            </div>
            <div className={`text-3xl font-bold ${
              result.trustScore < 30 ? "text-red-400" :
              result.trustScore < 60 ? "text-yellow-400" : "text-green-400"
            }`}>
              {result.trustScore}
            </div>
          </div>

          {/* Analysis */}
          <div className={`rounded-lg p-3 border ${
            result.severity === "danger" ? "bg-red-500/10 border-red-500/20" :
            result.severity === "warning" ? "bg-yellow-500/10 border-yellow-500/20" :
            "bg-green-500/10 border-green-500/20"
          }`}>
            <p className={`text-sm ${
              result.severity === "danger" ? "text-red-400" :
              result.severity === "warning" ? "text-yellow-400" : "text-green-400"
            }`}>
              {result.explanation}
            </p>
          </div>

          {/* Reason chips */}
          {result.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.reasons.map((r, i) => (
                <span key={i} className={ui.chip}>{r}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
