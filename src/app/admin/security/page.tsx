"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type AlertStatus   = "open" | "in_progress" | "resolved" | "false_positive";
type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface SecurityAlert {
  id: string;
  created_at: string;
  resolved_at: string | null;
  severity: AlertSeverity;
  type: string;
  ip: string | null;
  ip_masked: string | null;
  summary: string;
  playbook: string[] | null;
  evidence: Record<string, unknown>;
  status: AlertStatus;
  actions_taken: Array<{ type: string; target: string; result: string; detail?: string }>;
}

interface BlockedIp {
  ip: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
  vercel_rule_id: string | null;
}

interface PausedEndpoint {
  route: string;
  reason: string;
  expires_at: string | null;
}

interface DashboardSummary {
  totalAlerts24h: number;
  openAlerts: number;
  blockedIps: number;
  pausedEndpoints: number;
  honeypotHits24h: number;
  bySeverity: Record<string, number>;
}

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border border-red-500/30",
  HIGH:     "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  MEDIUM:   "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  LOW:      "bg-blue-500/15 text-blue-400 border border-blue-500/30",
};

const STATUS_COLOR: Record<AlertStatus, string> = {
  open:           "text-red-400",
  in_progress:    "text-orange-400",
  resolved:       "text-green-400",
  false_positive: "text-white/40",
};

type Tab = "alerts" | "endpoints" | "blocked";

export default function AdminSecurityPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState<Tab>("alerts");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertPage, setAlertPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [selected, setSelected] = useState<SecurityAlert | null>(null);
  const [updating, setUpdating] = useState(false);

  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [pausedEndpoints, setPausedEndpoints] = useState<PausedEndpoint[]>([]);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) { router.replace("/admin/login"); return; }
    if (session.role !== "super_admin" && session.role !== "owner") { router.replace("/admin"); return; }
    setAuthorized(true);
  }, [router]);

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/security-monitor/dashboard");
    if (res.ok) {
      const d = await res.json();
      setSummary(d.summary);
      setBlockedIps(d.blockedIps ?? []);
      setPausedEndpoints(d.pausedEndpoints ?? []);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String((alertPage - 1) * 20),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const res = await fetch(`/api/security-monitor/alerts?${params}`);
      if (res.ok) {
        const d = await res.json();
        setAlerts(d.alerts ?? []);
        setAlertTotal(d.total ?? 0);
      }
    } finally {
      setLoadingAlerts(false);
    }
  }, [alertPage, statusFilter]);

  useEffect(() => {
    if (!authorized) return;
    loadDashboard();
    loadAlerts();
  }, [authorized, loadDashboard, loadAlerts]);

  const patchAlert = async (id: string, status: string) => {
    setUpdating(true);
    try {
      await fetch("/api/security-monitor/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await loadAlerts();
      setSelected((prev) => prev ? { ...prev, status: status as AlertStatus } : null);
    } finally {
      setUpdating(false);
    }
  };

  if (!authorized) return null;

  return (
    <div className="py-2 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={ui.h1}>Security Monitor</h1>
          <p className={`${ui.muted2} text-sm mt-1`}>
            AI-powered breach detection · Auto-containment · Honeypot deception layer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/50">Monitor active</span>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Open Alerts",    value: summary.openAlerts,      color: summary.openAlerts > 0 ? "text-red-400" : "text-white" },
            { label: "Alerts 24h",     value: summary.totalAlerts24h,  color: "text-white" },
            { label: "Blocked IPs",    value: summary.blockedIps,      color: "text-orange-400" },
            { label: "Killed Routes",  value: summary.pausedEndpoints, color: "text-yellow-400" },
            { label: "Honeypot Hits",  value: summary.honeypotHits24h, color: summary.honeypotHits24h > 0 ? "text-red-400" : "text-white" },
          ].map((s) => (
            <div key={s.label} className={`${ui.card} p-4 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(["alerts", "endpoints", "blocked"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition ${
              tab === t ? "bg-white/15 text-white border border-white/20" : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`}
          >
            {t === "alerts" ? "Alerts" : t === "endpoints" ? "Paused Endpoints" : "Blocked IPs"}
          </button>
        ))}
      </div>

      {tab === "alerts" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <div className={`lg:col-span-2 space-y-3 ${selected ? "hidden lg:block" : ""}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {(["open", "in_progress", "resolved", "false_positive", ""] as const).map((s) => (
                <button
                  key={s || "all"}
                  onClick={() => { setStatusFilter(s); setAlertPage(1); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    statusFilter === s ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {s ? s.replace("_", " ") : "All"}
                </button>
              ))}
              <span className="ml-auto text-xs text-white/30">{alertTotal} total</span>
            </div>

            {loadingAlerts ? (
              <div className="text-white/40 text-sm py-8 text-center">Loading…</div>
            ) : alerts.length === 0 ? (
              <div className={`${ui.card} p-8 text-center text-white/40 text-sm`}>No alerts found</div>
            ) : (
              alerts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={`w-full text-left ${ui.card} p-4 hover:border-white/20 transition ${
                    selected?.id === a.id ? "border-blue-500/50 bg-white/[0.08]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEVERITY_COLOR[a.severity]}`}>
                        {a.severity}
                      </span>
                      <span className="text-xs text-white/70 font-medium">{a.type.replace(/_/g, " ")}</span>
                    </div>
                    <span className={`text-xs font-semibold ${STATUS_COLOR[a.status]}`}>{a.status}</span>
                  </div>
                  <p className="text-xs text-white/55 mt-2 line-clamp-2">{a.summary}</p>
                  <div className="flex items-center justify-between mt-2">
                    {a.ip_masked && <span className="text-xs font-mono text-white/40">{a.ip_masked}</span>}
                    <span className="text-xs text-white/30 ml-auto">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                </button>
              ))
            )}

            {alertTotal > 20 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button disabled={alertPage <= 1} onClick={() => setAlertPage((p) => p - 1)} className="text-sm text-white/50 hover:text-white disabled:opacity-30">← Prev</button>
                <span className="text-xs text-white/40">Page {alertPage}</span>
                <button disabled={alertPage * 20 >= alertTotal} onClick={() => setAlertPage((p) => p + 1)} className="text-sm text-white/50 hover:text-white disabled:opacity-30">Next →</button>
              </div>
            )}
          </div>

          <div className={`lg:col-span-3 ${!selected ? "hidden lg:block" : ""}`}>
            {!selected ? (
              <div className={`${ui.card} p-12 text-center text-white/30 hidden lg:flex items-center justify-center`}>Select an alert to view details</div>
            ) : (
              <div className={`${ui.card} p-5 md:p-6 space-y-5 md:space-y-6`}>
                {/* Mobile back button */}
                <button
                  onClick={() => setSelected(null)}
                  className="lg:hidden flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition -mt-1"
                >
                  ← Back to alerts
                </button>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${SEVERITY_COLOR[selected.severity]}`}>
                        {selected.severity}
                      </span>
                      <span className="text-white font-semibold">{selected.type.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-xs text-white/40 mt-1">
                      {new Date(selected.created_at).toLocaleString()}
                      {selected.ip_masked && ` · ${selected.ip_masked}`}
                    </p>
                  </div>
                  <span className={`text-sm font-bold ${STATUS_COLOR[selected.status]}`}>{selected.status}</span>
                </div>

                <div>
                  <p className={`${ui.label} mb-1`}>Summary</p>
                  <p className="text-sm text-white/80">{selected.summary}</p>
                </div>

                {selected.evidence && Object.keys(selected.evidence).length > 0 && (
                  <div>
                    <p className={`${ui.label} mb-2`}>Evidence</p>
                    <pre className="whitespace-pre-wrap text-xs text-white/60 bg-white/[0.04] rounded-xl p-4 font-mono">
                      {JSON.stringify(selected.evidence, null, 2)}
                    </pre>
                  </div>
                )}

                {selected.actions_taken.length > 0 && (
                  <div>
                    <p className={`${ui.label} mb-2`}>Actions Taken</p>
                    <ul className="space-y-1">
                      {selected.actions_taken.map((a, i) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <span className={a.result === "OK" ? "text-green-400" : a.result === "SKIPPED" ? "text-yellow-400" : "text-red-400"}>
                            {a.result === "OK" ? "✓" : a.result === "SKIPPED" ? "○" : "✗"}
                          </span>
                          <span className="text-white/60">{a.type} → {a.target}{a.detail ? ` (${a.detail})` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.playbook && selected.playbook.length > 0 && (
                  <div>
                    <p className={`${ui.label} mb-2`}>AI Remediation Playbook</p>
                    <ol className="space-y-2">
                      {selected.playbook.map((step, i) => (
                        <li key={i} className="text-xs text-white/70 flex items-start gap-2">
                          <span className="text-white/30 font-mono min-w-[16px]">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {(selected.status === "open" || selected.status === "in_progress") && (
                  <div>
                    <p className={`${ui.label} mb-2`}>Actions</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={updating}
                        onClick={() => patchAlert(selected.id, "in_progress")}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition disabled:opacity-50"
                      >
                        Mark In Progress
                      </button>
                      <button
                        disabled={updating}
                        onClick={() => patchAlert(selected.id, "resolved")}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition disabled:opacity-50"
                      >
                        Resolve
                      </button>
                      <button
                        disabled={updating}
                        onClick={() => patchAlert(selected.id, "false_positive")}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition disabled:opacity-50"
                      >
                        False Positive
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "endpoints" && (
        <div className="space-y-4">
          <div className={`${ui.card} p-4`}>
            <p className="text-xs text-yellow-400/80">
              Paused endpoints are automatically killed by the security monitor during active attacks. They re-enable automatically when the pause expires.
            </p>
          </div>
          {pausedEndpoints.length === 0 ? (
            <div className={`${ui.card} p-8 text-center text-white/40 text-sm`}>No endpoints currently paused</div>
          ) : (
            <div className="space-y-2">
              {pausedEndpoints.map((ep) => (
                <div key={ep.route} className={`${ui.card} p-4 flex items-center justify-between gap-4`}>
                  <div>
                    <p className="font-mono text-sm text-white/80">{ep.route}</p>
                    <p className="text-xs text-white/40 mt-0.5">{ep.reason}</p>
                    {ep.expires_at && (
                      <p className="text-xs text-orange-400/70 mt-0.5">
                        Auto-resumes {new Date(ep.expires_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-red-400">PAUSED</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "blocked" && (
        <div className="space-y-2">
          {blockedIps.length === 0 ? (
            <div className={`${ui.card} p-8 text-center text-white/40 text-sm`}>No IPs currently blocked</div>
          ) : (
            blockedIps.map((ip) => (
              <div key={ip.ip} className={`${ui.card} p-4 flex items-center justify-between gap-4`}>
                <div>
                  <p className="font-mono text-sm text-white/80">{ip.ip}</p>
                  <p className="text-xs text-white/40 mt-0.5">{ip.reason}</p>
                  <p className="text-xs text-white/30 mt-0.5">
                    Since {new Date(ip.created_at).toLocaleString()}
                    {ip.expires_at ? ` · expires ${new Date(ip.expires_at).toLocaleString()}` : " · permanent"}
                    {ip.vercel_rule_id && ` · Vercel rule ${ip.vercel_rule_id}`}
                  </p>
                </div>
                <span className="text-xs font-semibold text-red-400">BLOCKED</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
