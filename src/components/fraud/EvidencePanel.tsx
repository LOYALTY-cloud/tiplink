"use client";

import { useEffect, useState } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";
import { effectiveRiskLevel } from "@/lib/fraudExplain";

type AnomalyFlag = {
  type: string;
  score: number;
  decision: string;
  flags: string[] | null;
  reason: string | null;
  created_at: string;
};

type ProfileData = {
  user_id: string;
  trust_score: number | null;
  risk_level: string | null;
  freeze_reason: string | null;
  frozen_at: string | null;
  is_flagged: boolean;
  account_status: string | null;
};

type Props = {
  profile: ProfileData;
};

export default function EvidencePanel({ profile }: Props) {
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("fraud_anomalies")
        .select("type, score, decision, flags, reason, created_at")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(20);
      setAnomalies(data ?? []);
      setLoading(false);
    }
    load();
  }, [profile.user_id]);

  // Collect all unique flags across anomalies
  const allFlags = [...new Set(anomalies.flatMap((a) => a.flags ?? []))];

  // Derive evidence signals
  const signals: { label: string; present: boolean }[] = [
    { label: "New device detected", present: allFlags.includes("new_device") },
    { label: "New IP address", present: allFlags.includes("new_ip") || allFlags.includes("ip_mismatch") },
    { label: "Unusual withdrawal size", present: allFlags.includes("large_withdrawal") || allFlags.includes("amount_outlier") },
    { label: "Recent chargeback", present: allFlags.includes("chargeback") || allFlags.includes("recent_chargeback") },
    { label: "Multiple accounts", present: allFlags.includes("multi_account") || allFlags.includes("duplicate_device") },
    { label: "Activity spike", present: allFlags.includes("activity_spike") || allFlags.includes("velocity_spike") },
    { label: "Rapid withdrawals", present: allFlags.includes("rapid_withdrawals") },
    { label: "VPN / proxy detected", present: allFlags.includes("vpn") || allFlags.includes("proxy") },
    { label: "Suspicious timing", present: allFlags.includes("odd_hour") || allFlags.includes("suspicious_timing") },
  ];

  const activeSignals = signals.filter((s) => s.present);
  const highestScore = anomalies.length > 0 ? Math.max(...anomalies.map((a) => a.score)) : 0;
  const restrictCount = anomalies.filter((a) => a.decision === "restrict").length;

  return (
    <div className={`${ui.card} ${ui.cardInner} p-4 space-y-4`}>
      <h3 className="text-white font-semibold text-sm">Evidence</h3>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <p className={`text-lg font-bold ${
            (profile.trust_score ?? 50) < 30 ? "text-red-400" :
            (profile.trust_score ?? 50) < 60 ? "text-yellow-400" : "text-green-400"
          }`}>
            {profile.trust_score ?? "–"}
          </p>
          <p className="text-white/40 text-[10px] uppercase tracking-wide">Trust</p>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <p className={`text-lg font-bold ${
            highestScore >= 80 ? "text-red-400" :
            highestScore >= 60 ? "text-yellow-400" : "text-green-400"
          }`}>
            {highestScore || "–"}
          </p>
          <p className="text-white/40 text-[10px] uppercase tracking-wide">Peak Score</p>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <p className={`text-lg font-bold ${restrictCount > 0 ? "text-red-400" : "text-green-400"}`}>
            {restrictCount}
          </p>
          <p className="text-white/40 text-[10px] uppercase tracking-wide">Restricts</p>
        </div>
      </div>

      {/* Profile details */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-white/50">Risk Level</span>
          <span className={`font-medium ${
            effectiveRiskLevel(profile.risk_level ?? "low", profile) === "high" ? "text-red-400" :
            effectiveRiskLevel(profile.risk_level ?? "low", profile) === "medium" ? "text-yellow-400" : "text-green-400"
          }`}>
            {effectiveRiskLevel(profile.risk_level ?? "low", profile)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50">Status</span>
          <span className="text-white/80">{profile.account_status ?? "–"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50">Flagged</span>
          <span className={profile.is_flagged ? "text-red-400" : "text-green-400"}>
            {profile.is_flagged ? "Yes" : "No"}
          </span>
        </div>
        {profile.freeze_reason && (
          <div className="flex justify-between">
            <span className="text-white/50">Freeze Reason</span>
            <span className="text-red-400 text-xs max-w-[60%] text-right">{profile.freeze_reason}</span>
          </div>
        )}
      </div>

      {/* Evidence signals */}
      <div>
        <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-2">
          Detected Signals
        </p>
        {loading ? (
          <p className={`${ui.muted} text-xs`}>Scanning…</p>
        ) : activeSignals.length === 0 ? (
          <p className="text-green-400/70 text-xs">No suspicious signals detected</p>
        ) : (
          <div className="space-y-1">
            {activeSignals.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-red-400 text-xs">⚠</span>
                <span className="text-white/70 text-xs">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw flags */}
      {allFlags.length > 0 && (
        <div>
          <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-1.5">
            Raw Flags
          </p>
          <div className="flex flex-wrap gap-1">
            {allFlags.map((f, i) => (
              <span key={i} className={ui.chip}>{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Recent anomaly reasons */}
      {anomalies.some((a) => a.reason) && (
        <div>
          <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-1.5">
            AI Reasoning
          </p>
          <div className="space-y-1.5">
            {anomalies
              .filter((a) => a.reason)
              .slice(0, 5)
              .map((a, i) => (
                <p key={i} className="text-white/60 text-xs leading-relaxed">
                  <span className={`font-bold ${
                    a.score >= 80 ? "text-red-400" :
                    a.score >= 60 ? "text-yellow-400" : "text-orange-400"
                  }`}>
                    {a.score}
                  </span>{" "}
                  {a.reason}
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
