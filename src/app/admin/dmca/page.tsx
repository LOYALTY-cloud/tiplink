"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import { STRIKE_POINTS, SEVERITY_LABELS } from "@/types/strikes";
import type { StrikeSeverity } from "@/types/strikes";

type DmcaStatus   = "pending" | "reviewing" | "resolved" | "rejected";
type DmcaPriority = "low" | "normal" | "high" | "urgent";

interface DmcaReport {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  organization: string | null;
  infringing_content_url: string;
  status: DmcaStatus;
  priority: DmcaPriority;
  created_at: string;
  reviewed_at: string | null;
  moderator_notes: string | null;
}

interface DmcaReportDetail extends DmcaReport {
  user_id: string | null;
  phone: string | null;
  copyrighted_work: string;
  original_content_url: string | null;
  infringement_details: string;
  evidence_urls: string[];
  evidence_signed_urls: string[];
  electronic_signature: string;
  reviewed_by: string | null;
}

interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  changes: { field: string; old_value: unknown; new_value: unknown } | null;
  created_at: string;
}

interface TabCounts {
  pending: number;
  reviewing: number;
  resolved: number;
  rejected: number;
}

const TABS: { key: DmcaStatus; label: string }[] = [
  { key: "pending",   label: "Pending"   },
  { key: "reviewing", label: "Reviewing" },
  { key: "resolved",  label: "Resolved"  },
  { key: "rejected",  label: "Rejected"  },
];

const PRIORITY_BADGE: Record<DmcaPriority, string> = {
  low:    "bg-white/10 text-white/55",
  normal: "bg-blue-500/20 text-blue-300",
  high:   "bg-amber-500/20 text-amber-300",
  urgent: "bg-red-500/20 text-red-300",
};

const STATUS_BADGE: Record<DmcaStatus, string> = {
  pending:   "bg-yellow-500/20 text-yellow-300",
  reviewing: "bg-blue-500/20 text-blue-300",
  resolved:  "bg-green-500/20 text-green-300",
  rejected:  "bg-red-500/20 text-red-300",
};

export default function AdminDmcaPage() {
  const router = useRouter();

  const [activeTab,     setActiveTab]     = useState<DmcaStatus>("pending");
  const [reports,       setReports]       = useState<DmcaReport[]>([]);
  const [tabCounts,     setTabCounts]     = useState<TabCounts>({ pending: 0, reviewing: 0, resolved: 0, rejected: 0 });
  const [selected,      setSelected]      = useState<DmcaReportDetail | null>(null);
  const [loadingList,   setLoadingList]   = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving,        setSaving]        = useState(false);

  // Detail panel edit state
  const [editStatus,   setEditStatus]   = useState<DmcaStatus>("pending");
  const [editPriority, setEditPriority] = useState<DmcaPriority>("normal");
  const [editNotes,    setEditNotes]    = useState("");
  const [auditLogs,    setAuditLogs]    = useState<AuditLog[]>([]);

  // Issue Strike mini-panel
  const [showStrikeForm,  setShowStrikeForm]  = useState(false);
  const [strikeSeverity,  setStrikeSeverity]  = useState<StrikeSeverity>("warning");
  const [strikeCreatorId, setStrikeCreatorId] = useState("");
  const [strikeReason,    setStrikeReason]    = useState("");
  const [strikeNotes,     setStrikeNotes]     = useState("");
  const [strikeExpires,   setStrikeExpires]   = useState("");
  const [issuingStrike,   setIssuingStrike]   = useState(false);
  const [strikeMsg,       setStrikeMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Refs for outside-click detection
  const listRef   = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Close detail panel when clicking outside both the list and the detail panel
  useEffect(() => {
    if (!selected) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const inList   = listRef.current?.contains(target);
      const inDetail = detailRef.current?.contains(target);
      if (!inList && !inDetail) setSelected(null);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [selected]);

  // Auth guard
  useEffect(() => {
    const s = getAdminSession();
    if (!s) router.replace("/admin/login");
  }, [router]);

  // Load list whenever tab changes
  const loadReports = useCallback(async () => {
    setLoadingList(true);
    try {
      const res  = await fetch(`/api/admin/dmca?status=${activeTab}`, { headers: getAdminHeaders() });
      const json = await res.json();
      if (res.ok) {
        setReports(json.reports ?? []);
        setTabCounts(json.tabs ?? { pending: 0, reviewing: 0, resolved: 0, rejected: 0 });
      }
    } finally {
      setLoadingList(false);
    }
  }, [activeTab]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Load detail
  async function loadDetail(id: string) {
    setLoadingDetail(true);
    setSelected(null);
    setAuditLogs([]);
    try {
      const res  = await fetch(`/api/admin/dmca/${id}`, { headers: getAdminHeaders() });
      const json = await res.json();
      if (res.ok && json.report) {
        const r = json.report as DmcaReportDetail;
        setSelected(r);
        setEditStatus(r.status);
        setEditPriority(r.priority);
        setEditNotes(r.moderator_notes ?? "");
        setAuditLogs(json.auditLogs ?? []);
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  async function issueStrikeFromDmca() {
    if (!strikeCreatorId.trim()) {
      setStrikeMsg({ type: "err", text: "Creator User ID is required" });
      return;
    }
    if (!strikeReason.trim() || strikeReason.trim().length < 5) {
      setStrikeMsg({ type: "err", text: "Reason must be at least 5 characters" });
      return;
    }
    setIssuingStrike(true);
    setStrikeMsg(null);
    try {
      const res = await fetch("/api/admin/strikes", {
        method:  "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({
          creator_id:     strikeCreatorId.trim(),
          severity:       strikeSeverity,
          reason:         strikeReason.trim(),
          notes:          strikeNotes.trim() || undefined,
          expires_at:     strikeExpires || null,
          related_dmca_id: selected?.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to issue strike");
      setStrikeMsg({ type: "ok", text: `Strike issued — Risk level: ${json.creator_risk_level} (${json.creator_strike_points} pts)` });
      setShowStrikeForm(false);
      setStrikeCreatorId("");
      setStrikeReason("");
      setStrikeNotes("");
      setStrikeExpires("");
      setStrikeSeverity("warning");
    } catch (e: unknown) {
      setStrikeMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to issue strike" });
    } finally {
      setIssuingStrike(false);
    }
  }

  async function saveDetail() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/dmca/${selected.id}`, {
        method: "PATCH",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, priority: editPriority, moderator_notes: editNotes }),
      });
      if (res.ok) {
        await loadReports();
        // Reload detail to get updated timestamps
        await loadDetail(selected.id);
      }
    } finally {
      setSaving(false);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  return (
    <div className="py-2">
      {/* Header */}
      <div className="mb-6">
        <h1 className={ui.h1}>⚖️ DMCA / IP Complaints</h1>
        <p className={`${ui.muted2} mt-1 text-sm`}>Review and moderate intellectual property complaints</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelected(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition border ${
              activeTab === tab.key
                ? "bg-blue-500/15 border-blue-400/30 text-blue-200 shadow-[0_4px_16px_rgba(59,130,246,0.15)]"
                : "bg-white/[0.05] border-white/[0.08] text-white/50 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            {tab.label}
            <span className={`ml-2 text-xs ${activeTab === tab.key ? "text-blue-300/70" : "text-white/30"}`}>
              {tabCounts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-5 min-h-[600px] items-start">
        {/* Left: report list — hidden on mobile when a detail is open */}
        <div ref={listRef} className={`flex-1 min-w-0 space-y-2 w-full ${selected || loadingDetail ? "hidden md:block" : ""}`}>
          {loadingList ? (
            <div className="text-white/30 py-10 text-center text-sm">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="text-white/30 py-10 text-center text-sm">No {activeTab} complaints.</div>
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                onClick={() => loadDetail(r.id)}
                className={`w-full text-left rounded-2xl border p-4 transition backdrop-blur-xl ${
                  selected?.id === r.id
                    ? "border-blue-400/30 bg-blue-500/[0.08] shadow-[0_4px_24px_rgba(59,130,246,0.12)]"
                    : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/[0.15]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-white truncate">
                      {r.first_name} {r.last_name}
                      {r.organization && (
                        <span className="ml-2 font-normal text-white/40">· {r.organization}</span>
                      )}
                    </p>
                    <p className="text-xs text-white/40 truncate mt-0.5">{r.email}</p>
                    <p className="text-xs text-white/30 truncate mt-1">{r.infringing_content_url}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${PRIORITY_BADGE[r.priority]}`}>
                      {r.priority}
                    </span>
                    <span className="text-xs text-white/25">{fmtDate(r.created_at)}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: detail panel — full width on mobile, fixed width on desktop */}
        <div ref={detailRef} className={`w-full md:w-[420px] md:shrink-0 ${!selected && !loadingDetail ? "hidden md:block" : ""}`}>
          {loadingDetail ? (
            <div className={`${ui.card} p-8 text-center text-white/30 text-sm`}>
              Loading...
            </div>
          ) : selected ? (
            <div className={`${ui.card} p-6 space-y-5 sticky top-4 max-h-[calc(100vh-100px)] overflow-y-auto`}>
              {/* Mobile back button */}
              <button
                onClick={() => setSelected(null)}
                className="md:hidden flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition -mt-1 mb-1"
              >
                ← Back to list
              </button>
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-base text-white">
                    {selected.first_name} {selected.last_name}
                  </h2>
                  <p className="text-sm text-white/50 mt-0.5">{selected.email}</p>
                  {selected.organization && (
                    <p className="text-xs text-white/35 mt-0.5">{selected.organization}</p>
                  )}
                  {selected.phone && (
                    <p className="text-xs text-white/35 mt-0.5">{selected.phone}</p>
                  )}
                  <p className="text-xs text-white/25 mt-1">Submitted {fmtDate(selected.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${STATUS_BADGE[selected.status]}`}>
                    {selected.status}
                  </span>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-white/30 hover:text-white/70 transition text-lg leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/[0.07]" />

              {/* Copyrighted work */}
              <div>
                <p className={`${ui.label} mb-1.5`}>Copyrighted Work</p>
                <p className="text-sm text-white/70 leading-6 whitespace-pre-line">{selected.copyrighted_work}</p>
                {selected.original_content_url && (
                  <a
                    href={selected.original_content_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 transition mt-1 block truncate"
                  >
                    {selected.original_content_url}
                  </a>
                )}
              </div>

              {/* Infringing content */}
              <div>
                <p className={`${ui.label} mb-1.5`}>Infringing URL</p>
                <a
                  href={selected.infringing_content_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 transition break-all"
                >
                  {selected.infringing_content_url}
                </a>
              </div>

              {/* Details */}
              <div>
                <p className={`${ui.label} mb-1.5`}>Infringement Details</p>
                <p className="text-sm text-white/70 leading-6 whitespace-pre-line">{selected.infringement_details}</p>
              </div>

              {/* Evidence */}
              {selected.evidence_signed_urls.length > 0 && (
                <div>
                  <p className={`${ui.label} mb-2`}>Evidence</p>
                  <ul className="space-y-1">
                    {selected.evidence_signed_urls.map((url, i) => (
                      <li key={i}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 transition"
                        >
                          Evidence file {i + 1}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Signature */}
              <div>
                <p className={`${ui.label} mb-1.5`}>Electronic Signature</p>
                <p className="text-sm font-mono text-white/60 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">
                  {selected.electronic_signature}
                </p>
              </div>

              {/* Moderation controls */}
              <div className="pt-2 border-t border-white/[0.07] space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${ui.label} block mb-1.5`}>Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as DmcaStatus)}
                      className={ui.select}
                    >
                      <option value="pending">Pending</option>
                      <option value="reviewing">Reviewing</option>
                      <option value="resolved">Resolved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className={`${ui.label} block mb-1.5`}>Priority</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as DmcaPriority)}
                      className={ui.select}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`${ui.label} block mb-1.5`}>Moderator Notes</label>
                  <textarea
                    rows={4}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className={`${ui.input} resize-none`}
                    placeholder="Internal notes..."
                  />
                </div>

                {/* Quick action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditStatus("reviewing")}
                    className="flex-1 rounded-xl border border-blue-400/25 bg-blue-500/15 text-blue-300 text-xs py-2 hover:bg-blue-500/25 transition font-medium"
                  >
                    Reviewing
                  </button>
                  <button
                    onClick={() => setEditStatus("resolved")}
                    className="flex-1 rounded-xl border border-green-400/25 bg-green-500/15 text-green-300 text-xs py-2 hover:bg-green-500/25 transition font-medium"
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => setEditStatus("rejected")}
                    className="flex-1 rounded-xl border border-red-400/25 bg-red-500/15 text-red-300 text-xs py-2 hover:bg-red-500/25 transition font-medium"
                  >
                    Reject
                  </button>
                </div>

                <button
                  onClick={saveDetail}
                  disabled={saving}
                  className={`w-full ${ui.btnPrimary} py-3 text-sm`}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>

                {selected.reviewed_at && (
                  <p className="text-xs text-white/25 text-center">
                    Last reviewed {fmtDate(selected.reviewed_at)}
                  </p>
                )}
              </div>

              {/* Issue Strike */}
              <div className="pt-2 border-t border-white/[0.07]">
                  {strikeMsg && (
                    <div className={`rounded-lg px-3 py-2 text-xs mb-3 ${
                      strikeMsg.type === "ok"
                        ? "bg-green-500/15 border border-green-500/30 text-green-300"
                        : "bg-red-500/15 border border-red-500/30 text-red-300"
                    }`}>{strikeMsg.text}</div>
                  )}
                  {showStrikeForm ? (
                    <div className="space-y-3">
                      <p className={`${ui.label} mb-2`}>Issue Strike</p>
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Creator User ID <span className="text-red-400">*</span></label>
                        <input
                          value={strikeCreatorId}
                          onChange={(e) => setStrikeCreatorId(e.target.value)}
                          placeholder="auth.users UUID"
                          className={`${ui.input} w-full text-xs`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Severity</label>
                        <select
                          value={strikeSeverity}
                          onChange={(e) => setStrikeSeverity(e.target.value as StrikeSeverity)}
                          className={ui.select}
                          style={{ colorScheme: "dark" }}
                        >
                          {(["warning", "minor", "major", "critical"] as StrikeSeverity[]).map((s) => (
                            <option key={s} value={s} className="bg-zinc-900 text-white">{SEVERITY_LABELS[s]} ({STRIKE_POINTS[s]} pt{STRIKE_POINTS[s] !== 1 ? "s" : ""})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Reason <span className="text-red-400">*</span></label>
                        <input
                          value={strikeReason}
                          onChange={(e) => setStrikeReason(e.target.value)}
                          placeholder="Brief reason shown to creator"
                          className={`${ui.input} w-full`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Internal Notes</label>
                        <textarea
                          value={strikeNotes}
                          onChange={(e) => setStrikeNotes(e.target.value)}
                          rows={2}
                          placeholder="Internal context, not shown to creator"
                          className={`${ui.input} w-full resize-none text-xs`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Expires At <span className="text-white/25">(blank = permanent)</span></label>
                        <input
                          type="date"
                          value={strikeExpires}
                          onChange={(e) => setStrikeExpires(e.target.value)}
                          className={`${ui.input} w-full`}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={issueStrikeFromDmca}
                          disabled={issuingStrike}
                          className={`${ui.btnPrimary} px-4 py-1.5 text-xs disabled:opacity-50`}
                        >
                          {issuingStrike ? "Issuing…" : "Confirm Strike"}
                        </button>
                        <button
                          onClick={() => { setShowStrikeForm(false); setStrikeMsg(null); }}
                          className={`${ui.btnGhost} px-3 py-1.5 text-xs`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowStrikeForm(true); setStrikeCreatorId(selected.user_id ?? ""); setStrikeMsg(null); }}
                      className="w-full rounded-xl border border-orange-400/25 bg-orange-500/10 text-orange-300 text-xs py-2 hover:bg-orange-500/20 transition font-medium"
                    >
                      ⚡ Issue Strike
                    </button>
                  )}
                </div>

              {/* Audit log */}
              {auditLogs.length > 0 && (
                <div className="pt-2 border-t border-white/[0.07]">
                  <p className={`${ui.label} mb-3`}>Audit History</p>
                  <ul className="space-y-2">
                    {auditLogs.map((log) => (
                      <li key={log.id} className="flex items-start gap-2 text-xs">
                        <span className="text-white/25 font-mono shrink-0 mt-0.5">
                          {new Date(log.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-white/50">
                          {log.action.replace(/_/g, " ")}
                          {log.changes && (
                            <span className="text-white/35">
                              {" "}— {String(log.changes.old_value ?? "—")} → <span className="text-white/60">{String(log.changes.new_value ?? "—")}</span>
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] border-dashed p-10 text-center text-white/25 text-sm">
              Select a complaint to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
