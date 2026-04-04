"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { humanizeFlags } from "@/lib/fraudOrchestrator";
import { ui } from "@/lib/ui";
import { dispatchAIContext } from "@/lib/dispatchAIContext";

type Anomaly = {
  id: string;
  user_id: string | null;
  ip: string | null;
  type: string;
  score: number;
  decision: string;
  reason: string | null;
  flags: string[] | null;
  context: Record<string, unknown> | null;
  admin_override: string | null;
  created_at: string;
};

type ProfileInfo = {
  handle: string | null;
  display_name: string | null;
  risk_score: number;
  velocity_score: number;
  account_status: string;
};

const decisionColors: Record<string, string> = {
  restrict: "text-red-400 bg-red-500/10",
  review: "text-yellow-400 bg-yellow-500/10",
  flag: "text-orange-400 bg-orange-500/10",
  allow: "text-green-400 bg-green-500/10",
};

const overrideColors: Record<string, string> = {
  confirmed_fraud: "text-red-400 bg-red-500/10",
  false_positive: "text-blue-400 bg-blue-500/10",
};

export type EscalationAlert = {
  title: string;
  message: string;
};

type Props = {
  onEscalation: (alert: EscalationAlert) => void;
};

export default function FraudLiveFeed({ onEscalation }: Props) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileInfo>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [overriding, setOverriding] = useState<string | null>(null);

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("fraud_anomalies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter === "restrict") query = query.eq("decision", "restrict");
    else if (filter === "review") query = query.eq("decision", "review");
    else if (filter === "unresolved") query = query.is("admin_override", null).neq("decision", "allow");

    const { data } = await query;
    const rows = data ?? [];
    setAnomalies(rows);
    dispatchAIContext({
      alert_count: rows.length,
      restrict_count: rows.filter((r) => r.decision === "restrict").length,
      unresolved_count: rows.filter((r) => !r.admin_override && r.decision !== "allow").length,
      avg_score: rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0,
    });

    // Batch-fetch profiles
    const ids = [...new Set(rows.filter((r) => r.user_id).map((r) => r.user_id!))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, handle, display_name, risk_score, velocity_score, account_status")
        .in("user_id", ids);
      const map: Record<string, ProfileInfo> = {};
      for (const p of profiles ?? []) {
        map[p.user_id] = {
          handle: p.handle,
          display_name: p.display_name,
          risk_score: p.risk_score ?? 0,
          velocity_score: p.velocity_score ?? 0,
          account_status: p.account_status ?? "active",
        };
      }
      setProfileMap(map);
    }

    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchAnomalies();

    const channel = supabase
      .channel("admin-fraud-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fraud_anomalies" },
        (payload) => {
          fetchAnomalies();
          const row = payload.new as Partial<Anomaly>;
          if (row.type === "admin_override_spam") {
            const ctx = row.context as Record<string, unknown> | undefined;
            onEscalation({
              title: "⚠️ Multiple Overrides Detected",
              message: `Admin ${row.user_id?.slice(0, 8) ?? "unknown"}… performed ${ctx?.count ?? "3+"} overrides in 10 min`,
            });
          } else if (row.type === "auto_freeze") {
            onEscalation({
              title: "🔒 Account Auto-Frozen",
              message: `User ${row.user_id?.slice(0, 8) ?? "unknown"}… frozen: ${row.reason ?? "suspicious activity"}`,
            });
          } else if (row.type === "admin_risk_high") {
            onEscalation({
              title: "🔴 Admin Risk Escalation",
              message: `Admin ${row.user_id?.slice(0, 8) ?? "unknown"}… flagged with high risk score (${row.score ?? "?"})`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter, fetchAnomalies, onEscalation]);

  async function setOverride(id: string, override: string) {
    setOverriding(id);
    try {
      const headers = getAdminHeaders();
      await fetch("/api/admin/fraud-override", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ anomaly_id: id, override }),
      });
      setAnomalies((prev) =>
        prev.map((a) => (a.id === id ? { ...a, admin_override: override } : a))
      );
    } catch (_) {}
    setOverriding(null);
  }

  function userLabel(id: string | null) {
    if (!id) return "Anonymous";
    const p = profileMap[id];
    if (p?.handle) return `@${p.handle}`;
    if (p?.display_name) return p.display_name;
    return `${id.slice(0, 8)}…`;
  }

  function scoreColor(score: number) {
    if (score >= 80) return "text-red-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-green-400";
  }

  const stats = {
    total: anomalies.length,
    restricted: anomalies.filter((a) => a.decision === "restrict").length,
    review: anomalies.filter((a) => a.decision === "review").length,
    unresolved: anomalies.filter((a) => !a.admin_override && a.decision !== "allow").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`${ui.card} ${ui.cardInner} p-4`}>
          <p className={ui.muted}>Total</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className={`${ui.card} ${ui.cardInner} p-4`}>
          <p className="text-red-400 text-sm font-medium">Restricted</p>
          <p className="text-2xl font-bold text-red-400">{stats.restricted}</p>
        </div>
        <div className={`${ui.card} ${ui.cardInner} p-4`}>
          <p className="text-yellow-400 text-sm font-medium">Needs Review</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.review}</p>
        </div>
        <div className={`${ui.card} ${ui.cardInner} p-4`}>
          <p className="text-orange-400 text-sm font-medium">Unresolved</p>
          <p className="text-2xl font-bold text-orange-400">{stats.unresolved}</p>
        </div>
      </div>

      {/* Filters + Refresh */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {(["all", "restrict", "review", "unresolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg transition border ${
                filter === f
                  ? "text-white bg-white/10 border-white/20"
                  : "text-white/50 border-white/5 hover:text-white hover:bg-white/5"
              }`}
            >
              {f === "all" ? "All" : f === "restrict" ? "Restricted" : f === "review" ? "Needs Review" : "Unresolved"}
            </button>
          ))}
        </div>
        <button onClick={() => fetchAnomalies()} className={`${ui.btnGhost} ${ui.btnSmall}`}>
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : anomalies.length === 0 ? (
        <div className={`${ui.card} ${ui.cardInner} p-8 text-center`}>
          <p className={ui.muted}>No fraud anomalies found.</p>
        </div>
      ) : (
        <div id="fraud-alerts" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="py-3 px-3 font-medium">Time</th>
                <th className="py-3 px-3 font-medium">User</th>
                <th className="py-3 px-3 font-medium">Score</th>
                <th className="py-3 px-3 font-medium">Breakdown</th>
                <th className="py-3 px-3 font-medium">Decision</th>
                <th className="py-3 px-3 font-medium">Flags</th>
                <th className="py-3 px-3 font-medium">IP</th>
                <th className="py-3 px-3 font-medium">Status</th>
                <th className="py-3 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a) => {
                const ctx = a.context as Record<string, number | string> | null;
                const ruleScore = ctx?.rule_score ?? "–";
                const behaviorScore = ctx?.behavior_score ?? "–";
                const aiScore = ctx?.ai_score ?? "–";
                const amount = ctx?.amount;
                const prof = a.user_id ? profileMap[a.user_id] : null;

                return (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="py-3 px-3 text-white/70 whitespace-nowrap">
                      {new Date(a.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-3">
                      {a.user_id ? (
                        <Link href={`/admin/users/${a.user_id}`} className="text-blue-400 hover:underline">
                          {userLabel(a.user_id)}
                        </Link>
                      ) : (
                        <span className="text-white/40">Anonymous</span>
                      )}
                      {amount && (
                        <span className="text-white/40 ml-2 text-xs">${Number(amount).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`font-bold text-lg ${scoreColor(a.score)}`}>{a.score}</span>
                    </td>
                    <td className="py-3 px-3 text-xs text-white/60 whitespace-nowrap">
                      R:{ruleScore} · B:{behaviorScore} · AI:{aiScore}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          decisionColors[a.decision] ?? "text-white/50"
                        }`}
                      >
                        {a.decision}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {humanizeFlags(a.flags ?? []).slice(0, 4).map((f, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/60">
                            {f}
                          </span>
                        ))}
                        {(a.flags?.length ?? 0) > 4 && (
                          <span className="text-xs text-white/30">+{(a.flags!.length - 4)}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-white/40 text-xs font-mono">
                      {a.ip ? `${a.ip.slice(0, 15)}${a.ip.length > 15 ? "…" : ""}` : "–"}
                    </td>
                    <td className="py-3 px-3">
                      {a.admin_override ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            overrideColors[a.admin_override] ?? "text-white/50"
                          }`}
                        >
                          {a.admin_override === "confirmed_fraud" ? "Confirmed" : "False Positive"}
                        </span>
                      ) : prof?.account_status === "restricted" ? (
                        <span className="text-red-400 text-xs">Restricted</span>
                      ) : (
                        <span className="text-white/30 text-xs">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {!a.admin_override && a.decision !== "allow" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => setOverride(a.id, "confirmed_fraud")}
                            disabled={overriding === a.id}
                            className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                          >
                            Fraud
                          </button>
                          <button
                            onClick={() => setOverride(a.id, "false_positive")}
                            disabled={overriding === a.id}
                            className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition disabled:opacity-50"
                          >
                            FP
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Reasoning */}
      {anomalies.some((a) => a.reason) && (
        <div className={`${ui.card} ${ui.cardInner} p-4 space-y-3`}>
          <h2 className={`${ui.h2} text-lg`}>AI Reasoning (Recent)</h2>
          {anomalies
            .filter((a) => a.reason && a.score >= 40)
            .slice(0, 10)
            .map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <span className={`font-bold ${scoreColor(a.score)} min-w-[2rem]`}>{a.score}</span>
                <span className="text-white/70">{a.reason}</span>
                <span className="text-white/30 text-xs ml-auto whitespace-nowrap">
                  {new Date(a.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
