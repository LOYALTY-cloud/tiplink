"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import { STRIKE_POINTS, SEVERITY_LABELS, RISK_LEVEL_LABELS } from "@/types/strikes";
import type { StrikeSeverity, StrikeStatus, CreatorRiskLevel } from "@/types/strikes";

interface Strike {
  id: string;
  creator_id: string;
  severity: StrikeSeverity;
  reason: string;
  notes: string | null;
  strike_points: number;
  status: StrikeStatus;
  created_at: string;
  expires_at: string | null;
  theme_id: string | null;
  related_dmca_id: string | null;
  issued_by: string | null;
  creator_handle: string | null;
  creator_display: string | null;
  creator_email: string | null;
  issuer_handle: string | null;
  issuer_display: string | null;
}

interface IssueForm {
  creator_id: string;
  severity: StrikeSeverity;
  reason: string;
  notes: string;
  expires_at: string;
}

const SEVERITY_BADGE: Record<StrikeSeverity, string> = {
  warning:  "bg-yellow-500/20 text-yellow-300",
  minor:    "bg-orange-500/20 text-orange-300",
  major:    "bg-red-500/20    text-red-300",
  critical: "bg-red-700/30    text-red-200",
};

const STATUS_BADGE: Record<StrikeStatus, string> = {
  active:   "bg-red-500/20   text-red-300",
  appealed: "bg-blue-500/20  text-blue-300",
  removed:  "bg-green-500/20 text-green-300",
  expired:  "bg-white/10     text-white/45",
};

const STATUS_TABS: { key: StrikeStatus | "all"; label: string }[] = [
  { key: "active",   label: "Active"   },
  { key: "appealed", label: "Appealed" },
  { key: "removed",  label: "Removed"  },
  { key: "expired",  label: "Expired"  },
  { key: "all",      label: "All"      },
];

const BLANK_FORM: IssueForm = {
  creator_id: "",
  severity:   "warning",
  reason:     "",
  notes:      "",
  expires_at: "",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminStrikesPage() {
  const router = useRouter();

  const [statusFilter,  setStatusFilter]  = useState<StrikeStatus | "all">("active");
  const [strikes,       setStrikes]       = useState<Strike[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState<Strike | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);

  const [issueForm,  setIssueForm]  = useState<IssueForm>(BLANK_FORM);
  const [issuing,    setIssuing]    = useState(false);
  const [patching,   setPatching]   = useState(false);
  const [alertMsg,   setAlertMsg]   = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const listRef   = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = getAdminSession();
    if (!s) router.replace("/admin/login");
  }, [router]);

  useEffect(() => {
    if (!selected && !showIssueForm) return;
    function handleMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !detailRef.current?.contains(t)) {
        setSelected(null);
        setShowIssueForm(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [selected, showIssueForm]);

  const fetchStrikes = useCallback(async (filter: StrikeStatus | "all") => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/strikes?status=${filter}&page=0`, { headers: getAdminHeaders() });
      const json = await res.json();
      if (res.ok) setStrikes(json.strikes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStrikes(statusFilter); }, [statusFilter, fetchStrikes]);

  const handleIssueStrike = async () => {
    setIssuing(true);
    setAlertMsg(null);
    try {
      if (!issueForm.creator_id.trim())
        throw new Error("Creator ID is required");
      if (issueForm.reason.trim().length < 5)
        throw new Error("Reason must be at least 5 characters");

      const res = await fetch("/api/admin/strikes", {
        method:  "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({
          creator_id: issueForm.creator_id.trim(),
          severity:   issueForm.severity,
          reason:     issueForm.reason.trim(),
          notes:      issueForm.notes.trim() || undefined,
          expires_at: issueForm.expires_at || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to issue strike");

      setAlertMsg({
        type: "ok",
        text: `Strike issued — risk level: ${RISK_LEVEL_LABELS[json.creator_risk_level as CreatorRiskLevel]} (${json.creator_strike_points} pts)`,
      });
      setIssueForm(BLANK_FORM);
      setShowIssueForm(false);
      fetchStrikes(statusFilter);
    } catch (e: unknown) {
      setAlertMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to issue strike" });
    } finally {
      setIssuing(false);
    }
  };

  const handlePatch = async (strikeId: string, newStatus: StrikeStatus) => {
    setPatching(true);
    setAlertMsg(null);
    try {
      const res  = await fetch(`/api/admin/strikes/${strikeId}`, {
        method:  "PATCH",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setAlertMsg({
        type: "ok",
        text: `Strike ${newStatus} — risk: ${RISK_LEVEL_LABELS[json.creator_risk_level as CreatorRiskLevel]} (${json.creator_strike_points} pts)`,
      });
      setSelected(null);
      fetchStrikes(statusFilter);
    } catch (e: unknown) {
      setAlertMsg({ type: "err", text: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setPatching(false);
    }
  };

  const panelOpen = selected !== null || showIssueForm;

  return (
    <div className="py-2">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className={ui.h1}>⚡ Creator Strikes</h1>
          <p className={`${ui.muted2} mt-1 text-sm`}>Issue, review and resolve creator moderation strikes</p>
        </div>
        <button
          onClick={() => { setShowIssueForm(true); setSelected(null); setAlertMsg(null); }}
          className={`${ui.btnPrimary} px-5 py-2.5 text-sm shrink-0`}
        >
          + Issue Strike
        </button>
      </div>

      {/* Alert banner */}
      {alertMsg && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
          alertMsg.type === "ok"
            ? "bg-green-500/10 border-green-500/25 text-green-300"
            : "bg-red-500/10 border-red-500/25 text-red-300"
        }`}>
          {alertMsg.text}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setSelected(null); setShowIssueForm(false); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition border ${
              statusFilter === tab.key
                ? "bg-blue-500/15 border-blue-400/30 text-blue-200 shadow-[0_4px_16px_rgba(59,130,246,0.15)]"
                : "bg-white/[0.05] border-white/[0.08] text-white/50 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-col md:flex-row gap-5 min-h-[600px] items-start">

        {/* Left: strike list */}
        <div
          ref={listRef}
          className={`flex-1 min-w-0 space-y-2 w-full ${panelOpen ? "hidden md:block" : ""}`}
        >
          {loading ? (
            <div className="text-white/30 py-10 text-center text-sm">Loading…</div>
          ) : strikes.length === 0 ? (
            <div className="text-white/30 py-10 text-center text-sm">No {statusFilter} strikes.</div>
          ) : (
            strikes.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelected(s); setShowIssueForm(false); setAlertMsg(null); }}
                className={`w-full text-left rounded-2xl border p-4 transition backdrop-blur-xl ${
                  selected?.id === s.id
                    ? "border-blue-400/30 bg-blue-500/[0.08] shadow-[0_4px_24px_rgba(59,130,246,0.12)]"
                    : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/[0.15]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-white truncate">
                      {s.creator_display ?? s.creator_handle ?? s.creator_id.slice(0, 12) + "…"}
                    </p>
                    {s.creator_email && (
                      <p className="text-xs text-white/40 truncate mt-0.5">{s.creator_email}</p>
                    )}
                    <p className="text-xs text-white/30 truncate mt-1">{s.reason}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[s.severity]}`}>
                      {SEVERITY_LABELS[s.severity]}
                    </span>
                    <span className="text-xs text-white/25">{fmtDate(s.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status]}`}>
                    {s.status}
                  </span>
                  <span className="text-xs text-white/25">{s.strike_points} pt{s.strike_points !== 1 ? "s" : ""}</span>
                  {s.related_dmca_id && (
                    <span className="text-xs text-white/25">· DMCA</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: detail / issue-form panel */}
        <div
          ref={detailRef}
          className={`w-full md:w-[420px] md:shrink-0 ${!panelOpen ? "hidden md:block" : ""}`}
        >
          {!panelOpen ? (
            <div className={`${ui.card} p-8 text-center text-white/30 text-sm`}>
              Select a strike or issue a new one
            </div>

          ) : showIssueForm ? (
            <div className={`${ui.card} p-6 space-y-5 sticky top-4 max-h-[calc(100vh-100px)] overflow-y-auto`}>
              <button
                onClick={() => setShowIssueForm(false)}
                className="md:hidden flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition -mt-1 mb-1"
              >
                ← Back to list
              </button>

              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-base text-white">Issue Strike</h2>
                <button
                  onClick={() => setShowIssueForm(false)}
                  className="text-white/30 hover:text-white/70 transition text-lg leading-none"
                >
                  ×
                </button>
              </div>

              <div className="border-t border-white/[0.07]" />

              <div className="space-y-4">
                <div>
                  <label className={`${ui.label} block mb-1.5`}>
                    Creator User ID <span className="text-red-400 normal-case">*</span>
                  </label>
                  <input
                    value={issueForm.creator_id}
                    onChange={(e) => setIssueForm((f) => ({ ...f, creator_id: e.target.value }))}
                    placeholder="auth.users UUID"
                    className={ui.input}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${ui.label} block mb-1.5`}>
                      Severity <span className="text-red-400 normal-case">*</span>
                    </label>
                    <select
                      value={issueForm.severity}
                      onChange={(e) => setIssueForm((f) => ({ ...f, severity: e.target.value as StrikeSeverity }))}
                      className={ui.select}
                      style={{ colorScheme: "dark" }}
                    >
                      {(["warning", "minor", "major", "critical"] as StrikeSeverity[]).map((sv) => (
                        <option key={sv} value={sv} className="bg-zinc-900 text-white">
                          {SEVERITY_LABELS[sv]} ({STRIKE_POINTS[sv]} pt{STRIKE_POINTS[sv] !== 1 ? "s" : ""})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`${ui.label} block mb-1.5`}>Expires</label>
                    <input
                      type="date"
                      value={issueForm.expires_at}
                      onChange={(e) => setIssueForm((f) => ({ ...f, expires_at: e.target.value }))}
                      className={ui.input}
                    />
                  </div>
                </div>

                <div>
                  <label className={`${ui.label} block mb-1.5`}>
                    Reason <span className="text-red-400 normal-case">*</span>
                  </label>
                  <input
                    value={issueForm.reason}
                    onChange={(e) => setIssueForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="Shown to creator"
                    className={ui.input}
                  />
                </div>

                <div>
                  <label className={`${ui.label} block mb-1.5`}>Internal Notes</label>
                  <textarea
                    value={issueForm.notes}
                    onChange={(e) => setIssueForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Internal context, not shown to creator"
                    className={`${ui.input} resize-none`}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleIssueStrike}
                  disabled={issuing}
                  className={`${ui.btnPrimary} flex-1 py-2.5 text-sm`}
                >
                  {issuing ? "Issuing…" : "Confirm Strike"}
                </button>
                <button
                  onClick={() => setShowIssueForm(false)}
                  className={`${ui.btnGhost} px-4 py-2.5 text-sm`}
                >
                  Cancel
                </button>
              </div>
            </div>

          ) : selected ? (
            <div className={`${ui.card} p-6 space-y-5 sticky top-4 max-h-[calc(100vh-100px)] overflow-y-auto`}>
              <button
                onClick={() => setSelected(null)}
                className="md:hidden flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition -mt-1 mb-1"
              >
                ← Back to list
              </button>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-base text-white">
                    {selected.creator_display ?? selected.creator_handle ?? "Creator"}
                  </h2>
                  {selected.creator_email && (
                    <p className="text-sm text-white/50 mt-0.5">{selected.creator_email}</p>
                  )}
                  <p className="text-xs text-white/25 mt-1">Issued {fmtDate(selected.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[selected.severity]}`}>
                    {SEVERITY_LABELS[selected.severity]}
                  </span>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-white/30 hover:text-white/70 transition text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="border-t border-white/[0.07]" />

              <div className="space-y-4">
                <div>
                  <p className={`${ui.label} mb-1.5`}>Status</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[selected.status]}`}>
                    {selected.status}
                  </span>
                  <span className="ml-2 text-xs text-white/35">
                    {selected.strike_points} pt{selected.strike_points !== 1 ? "s" : ""}
                  </span>
                </div>

                <div>
                  <p className={`${ui.label} mb-1.5`}>Reason</p>
                  <p className="text-sm text-white/70 leading-6">{selected.reason}</p>
                </div>

                {selected.notes && (
                  <div>
                    <p className={`${ui.label} mb-1.5`}>Internal Notes</p>
                    <p className="text-sm text-white/55 leading-6 whitespace-pre-line">{selected.notes}</p>
                  </div>
                )}

                {selected.issued_by && (
                  <div>
                    <p className={`${ui.label} mb-1.5`}>Issued By</p>
                    <p className="text-sm text-white/70">
                      {selected.issuer_display ?? selected.issuer_handle ?? selected.issued_by.slice(0, 12) + "…"}
                    </p>
                  </div>
                )}

                {selected.expires_at && (
                  <div>
                    <p className={`${ui.label} mb-1.5`}>Expires</p>
                    <p className="text-sm text-white/70">{fmtDate(selected.expires_at)}</p>
                  </div>
                )}

                {selected.related_dmca_id && (
                  <div>
                    <p className={`${ui.label} mb-1.5`}>DMCA Report</p>
                    <a
                      href={`/admin/dmca?id=${selected.related_dmca_id}`}
                      className="text-sm text-blue-400 hover:text-blue-300 transition"
                    >
                      View report →
                    </a>
                  </div>
                )}
              </div>

              <div className="border-t border-white/[0.07]" />

              {selected.status === "active" && (
                <div className="space-y-3">
                  <p className={ui.label}>Update Status</p>
                  <div className="flex gap-2">
                    <button
                      disabled={patching}
                      onClick={() => handlePatch(selected.id, "appealed")}
                      className="flex-1 rounded-xl border border-blue-400/25 bg-blue-500/15 text-blue-300 text-xs py-2 hover:bg-blue-500/25 transition font-medium disabled:opacity-50"
                    >
                      Mark Appealed
                    </button>
                    <button
                      disabled={patching}
                      onClick={() => handlePatch(selected.id, "expired")}
                      className="flex-1 rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/50 text-xs py-2 hover:bg-white/[0.08] transition font-medium disabled:opacity-50"
                    >
                      Mark Expired
                    </button>
                  </div>
                  <button
                    disabled={patching}
                    onClick={() => handlePatch(selected.id, "removed")}
                    className="w-full rounded-xl border border-green-400/25 bg-green-500/15 text-green-300 text-xs py-2 hover:bg-green-500/25 transition font-medium disabled:opacity-50"
                  >
                    Remove Strike
                  </button>
                </div>
              )}

              {selected.status === "appealed" && (
                <div className="space-y-3">
                  <p className={ui.label}>Resolve Appeal</p>
                  <div className="flex gap-2">
                    <button
                      disabled={patching}
                      onClick={() => handlePatch(selected.id, "active")}
                      className="flex-1 rounded-xl border border-red-400/25 bg-red-500/15 text-red-300 text-xs py-2 hover:bg-red-500/25 transition font-medium disabled:opacity-50"
                    >
                      Deny Appeal
                    </button>
                    <button
                      disabled={patching}
                      onClick={() => handlePatch(selected.id, "removed")}
                      className="flex-1 rounded-xl border border-green-400/25 bg-green-500/15 text-green-300 text-xs py-2 hover:bg-green-500/25 transition font-medium disabled:opacity-50"
                    >
                      Grant Appeal
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <a
                  href={`/admin/creators/${selected.creator_id}/risk`}
                  className={`${ui.btnLink} text-xs`}
                >
                  View full creator risk profile →
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
