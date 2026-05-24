"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

type ReportRow = {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  target_owner_id: string | null;
  reason: string;
  details: string | null;
  evidence_urls: string[] | null;
  status: string;
  priority: string;
  requires_manual_review: boolean;
  moderation_action: string | null;
  resolved_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  reporter: { user_id: string; display_name: string | null; handle: string | null; email: string | null } | null;
  target_owner: { user_id: string; display_name: string | null; handle: string | null; email: string | null } | null;
};

type TabCounts = {
  pending: number;
  reviewing: number;
  resolved: number;
  dismissed: number;
};

const REASON_LABELS: Record<string, string> = {
  fraud:          "Fraud / Scam",
  impersonation:  "Impersonation",
  stolen_content: "Stolen Content",
  payment_abuse:  "Payment Abuse",
  spam:           "Spam",
  harassment:     "Harassment",
  inappropriate:  "Inappropriate Content",
  fake_tips:      "Fake Tips",
  payout_abuse:   "Payout Abuse",
  other:          "Other",
};

const TARGET_ICONS: Record<string, string> = {
  creator:     "🎨",
  user:        "👤",
  transaction: "💳",
  theme:       "🖼️",
  post:        "📝",
  comment:     "💬",
};

const PRIORITY_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  critical: { label: "CRITICAL", bg: "bg-red-500/15",    text: "text-red-400" },
  high:     { label: "HIGH",     bg: "bg-orange-500/15", text: "text-orange-400" },
  normal:   { label: "NORMAL",   bg: "bg-white/10",      text: "text-white/50" },
  low:      { label: "LOW",      bg: "bg-white/5",       text: "text-white/30" },
};

const STATUS_STYLES: Record<string, string> = {
  pending:   "text-yellow-400",
  reviewing: "text-blue-400",
  resolved:  "text-green-400",
  dismissed: "text-white/30",
};

const MODERATION_ACTIONS = [
  "No action needed",
  "User warned",
  "Content removed",
  "Account restricted",
  "Account suspended",
  "Account terminated",
  "Escalated to Stripe",
  "Fraud investigation opened",
  "False report",
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminReportsPage() {
  const router = useRouter();
  const session = getAdminSession();

  const [reports, setReports]     = useState<ReportRow[]>([]);
  const [tabs, setTabs]           = useState<TabCounts>({ pending: 0, reviewing: 0, resolved: 0, dismissed: 0 });
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [filterType, setFilterType] = useState("");
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  // Expanded report + inline action state
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [actionReportId, setActionReportId] = useState<string | null>(null);
  const [actionStatus, setActionStatus]     = useState("");
  const [actionMod, setActionMod]           = useState("");
  const [actionNotes, setActionNotes]       = useState("");
  const [actionPriority, setActionPriority] = useState("");
  const [actionLoading, setActionLoading]   = useState(false);

  // Cancel in-flight requests when deps change (tab switch, filter change)
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!session) { router.replace("/admin/login"); return; }
  }, []);

  const load = useCallback(async () => {
    // Abort any previous in-flight request before starting a new one
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status: activeTab, page: String(page) });
      if (filterType) params.set("target_type", filterType);
      const res = await fetch(`/api/admin/reports?${params}`, {
        headers: getAdminHeaders(),
        signal,
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setReports(data.reports ?? []);
      setTabs(data.tabs ?? { pending: 0, reviewing: 0, resolved: 0, dismissed: 0 });
      setTotal(data.total ?? 0);
    } catch (err) {
      // Ignore aborted requests — they're intentional cancellations
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Failed to load reports");
    } finally {
      // Only clear loading if this request wasn't aborted
      if (!signal.aborted) setLoading(false);
    }
  }, [activeTab, filterType, page]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when the user returns to this browser tab after being away
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Clear expanded card + action form when switching tabs or changing filter
  useEffect(() => {
    setExpanded(null);
    setActionReportId(null);
  }, [activeTab, filterType]);

  function openAction(r: ReportRow) {
    setActionReportId(r.id);
    setActionStatus(r.status === "pending" ? "reviewing" : r.status);
    setActionMod(r.moderation_action ?? "");
    setActionNotes(r.resolved_notes ?? "");
    setActionPriority(r.priority);
  }

  async function submitAction() {
    if (!actionReportId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/${actionReportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          status: actionStatus,
          moderation_action: actionMod || null,
          resolved_notes: actionNotes || null,
          priority: actionPriority,
        }),
      });
      if (!res.ok) { setError("Failed to update report"); return; }
      setActionReportId(null);
      await load();
    } catch {
      setError("Failed to update report");
    } finally {
      setActionLoading(false);
    }
  }

  const TAB_ORDER = ["pending", "reviewing", "resolved", "dismissed"] as const;
  const TARGET_TYPES = ["creator", "user", "transaction", "theme", "post", "comment"];

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`${ui.h2}`}>🚩 Moderation Queue</h1>
          <p className={`text-xs ${ui.muted2} mt-0.5`}>
            Reports filed by users — fraud, impersonation, payment abuse, stolen content
          </p>
        </div>
        <button onClick={load} className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}>↺ Refresh</button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error} <button onClick={() => setError("")} className="ml-2 text-red-400">✕</button>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setPage(0); }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold capitalize transition flex items-center justify-center gap-1.5 ${
              activeTab === tab ? ui.navActive : ui.navIdle
            }`}
          >
            <span className={STATUS_STYLES[tab]}>{
              tab === "pending" ? "⏳" :
              tab === "reviewing" ? "🔍" :
              tab === "resolved" ? "✅" : "🚫"
            }</span>
            {tab}
            {tabs[tab] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === "pending" && tabs.pending > 0 ? "bg-yellow-500/20 text-yellow-400" :
                tab === "reviewing" ? "bg-blue-500/20 text-blue-400" :
                "bg-white/10 text-white/40"
              }`}>
                {tabs[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setFilterType(""); setPage(0); }}
          className={`${ui.btnSmall} text-xs ${!filterType ? "bg-blue-500/20 text-blue-300 border border-blue-400/30" : "bg-white/5 text-white/50 border border-white/10"} rounded-lg px-3 py-1.5 transition`}
        >
          All types
        </button>
        {TARGET_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => { setFilterType(t); setPage(0); }}
            className={`${ui.btnSmall} text-xs flex items-center gap-1 ${filterType === t ? "bg-blue-500/20 text-blue-300 border border-blue-400/30" : "bg-white/5 text-white/50 border border-white/10"} rounded-lg px-3 py-1.5 transition`}
          >
            {TARGET_ICONS[t]} {t}
          </button>
        ))}
      </div>

      {/* Report List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${ui.card} h-20 animate-pulse`} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className={`${ui.card} p-10 text-center`}>
          <p className="text-2xl mb-2">🎉</p>
          <p className={`text-sm ${ui.muted2}`}>No {activeTab} reports{filterType ? ` for ${filterType}` : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const pStyle = PRIORITY_STYLES[r.priority] ?? PRIORITY_STYLES.normal;
            const isExpanded = expanded === r.id;
            const isActioning = actionReportId === r.id;

            return (
              <div
                key={r.id}
                className={`${ui.card} overflow-hidden transition ${r.requires_manual_review ? "border-orange-500/30" : ""}`}
              >
                {/* Card Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-white/[0.02] transition"
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Target Type Icon */}
                      <div className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-base shrink-0">
                        {TARGET_ICONS[r.target_type] ?? "❓"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold capitalize">
                            {REASON_LABELS[r.reason] ?? r.reason}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${pStyle.bg} ${pStyle.text}`}>
                            {pStyle.label}
                          </span>
                          {r.requires_manual_review && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/20">
                              ⚠️ Manual Review
                            </span>
                          )}
                          <span className="text-[10px] bg-white/8 px-1.5 py-0.5 rounded text-white/50 capitalize">
                            {r.target_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-white/40 flex-wrap">
                          {r.reporter && (
                            <span>
                              Reporter: <span className="text-white/60">{r.reporter.display_name ?? r.reporter.handle ?? r.reporter.email ?? "Unknown"}</span>
                            </span>
                          )}
                          {r.target_owner && (
                            <span>
                              Against: <span className="text-white/60">{r.target_owner.display_name ?? r.target_owner.handle ?? "Unknown"}</span>
                            </span>
                          )}
                          <span>{timeAgo(r.created_at)}</span>
                        </div>
                        {r.details && (
                          <p className={`text-xs ${ui.muted2} mt-1 truncate max-w-[400px]`}>{r.details}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}>
                        {r.status}
                      </span>
                      <span className="text-white/30 text-sm">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded Detail + Action Panel */}
                {isExpanded && (
                  <div className="border-t border-white/10 p-4 space-y-4">
                    {/* Full details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className={`text-[10px] uppercase tracking-wider ${ui.muted2}`}>Target ID</p>
                        <p className="text-xs font-mono text-white/70 break-all">{r.target_id}</p>
                      </div>
                      {r.details && (
                        <div className="space-y-2">
                          <p className={`text-[10px] uppercase tracking-wider ${ui.muted2}`}>Details</p>
                          <p className="text-xs text-white/70 leading-relaxed">{r.details}</p>
                        </div>
                      )}
                    </div>

                    {/* Evidence URLs */}
                    {r.evidence_urls && r.evidence_urls.length > 0 && (
                      <div>
                        <p className={`text-[10px] uppercase tracking-wider ${ui.muted2} mb-1`}>Evidence</p>
                        <div className="space-y-1">
                          {r.evidence_urls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300 block truncate"
                            >
                              🔗 {url}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Existing resolution info */}
                    {(r.moderation_action || r.resolved_notes) && (
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        {r.moderation_action && (
                          <p className="text-xs"><span className={ui.muted2}>Action:</span> <span className="text-white/70">{r.moderation_action}</span></p>
                        )}
                        {r.resolved_notes && (
                          <p className="text-xs"><span className={ui.muted2}>Notes:</span> <span className="text-white/70">{r.resolved_notes}</span></p>
                        )}
                        {r.reviewed_at && (
                          <p className="text-xs text-white/30">Reviewed {timeAgo(r.reviewed_at)}</p>
                        )}
                      </div>
                    )}

                    {/* Quick jump links */}
                    <div className="flex gap-2 flex-wrap">
                      {r.target_type === "user" || r.target_type === "creator" ? (
                        <button
                          onClick={() => router.push(`/admin/users?q=${r.target_id}`)}
                          className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
                        >
                          View Target User →
                        </button>
                      ) : r.target_type === "transaction" ? (
                        <button
                          onClick={() => router.push(`/admin/transactions?q=${r.target_id}`)}
                          className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
                        >
                          View Transaction →
                        </button>
                      ) : r.target_type === "theme" ? (
                        <button
                          onClick={() => router.push(`/admin/marketplace?q=${r.target_id}`)}
                          className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
                        >
                          View Theme →
                        </button>
                      ) : null}
                      {r.target_owner && (
                        <button
                          onClick={() => router.push(`/admin/users?q=${r.target_owner!.user_id}`)}
                          className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-orange-400`}
                        >
                          View Content Owner →
                        </button>
                      )}
                    </div>

                    {/* Inline Action Form */}
                    {isActioning ? (
                      <div className="pt-3 border-t border-white/10 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`text-xs ${ui.muted2} mb-1 block`}>Status</label>
                            <select
                              value={actionStatus}
                              onChange={(e) => setActionStatus(e.target.value)}
                              className={ui.select}
                            >
                              <option value="reviewing">Reviewing</option>
                              <option value="resolved">Resolved</option>
                              <option value="dismissed">Dismissed</option>
                            </select>
                          </div>
                          <div>
                            <label className={`text-xs ${ui.muted2} mb-1 block`}>Priority</label>
                            <select
                              value={actionPriority}
                              onChange={(e) => setActionPriority(e.target.value)}
                              className={ui.select}
                            >
                              <option value="low">Low</option>
                              <option value="normal">Normal</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className={`text-xs ${ui.muted2} mb-1 block`}>Moderation Action</label>
                          <select
                            value={actionMod}
                            onChange={(e) => setActionMod(e.target.value)}
                            className={ui.select}
                          >
                            <option value="">— Select action —</option>
                            {MODERATION_ACTIONS.map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`text-xs ${ui.muted2} mb-1 block`}>Internal Notes</label>
                          <textarea
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            className={`${ui.input} min-h-[70px] text-sm`}
                            placeholder="Internal moderation notes (not visible to user)…"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setActionReportId(null)}
                            className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={submitAction}
                            disabled={actionLoading}
                            className={`${ui.btnPrimary} ${ui.btnSmall} text-xs`}
                          >
                            {actionLoading ? "Saving…" : "Save Decision"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-2 border-t border-white/10">
                        {r.status === "pending" && (
                          <button
                            onClick={() => openAction(r)}
                            className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-blue-400`}
                          >
                            🔍 Start Review
                          </button>
                        )}
                        {r.status === "reviewing" && (
                          <>
                            <button
                              onClick={() => { openAction(r); setActionStatus("resolved"); }}
                              className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-green-400`}
                            >
                              ✅ Resolve
                            </button>
                            <button
                              onClick={() => { openAction(r); setActionStatus("dismissed"); }}
                              className={`${ui.btnGhost} ${ui.btnSmall} text-xs text-white/40`}
                            >
                              🚫 Dismiss
                            </button>
                          </>
                        )}
                        {(r.status === "resolved" || r.status === "dismissed") && (
                          <button
                            onClick={() => openAction(r)}
                            className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
                          >
                            ✏️ Edit
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 30 && (
        <div className="flex items-center justify-between pt-2">
          <p className={`text-xs ${ui.muted2}`}>{total} total · page {page + 1}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={`${ui.btnGhost} ${ui.btnSmall} text-xs disabled:opacity-30`}
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * 30 >= total}
              className={`${ui.btnGhost} ${ui.btnSmall} text-xs disabled:opacity-30`}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
