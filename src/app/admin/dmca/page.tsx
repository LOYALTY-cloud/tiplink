"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

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
  low:    "bg-zinc-800 text-zinc-300",
  normal: "bg-blue-950 text-blue-300",
  high:   "bg-amber-950 text-amber-300",
  urgent: "bg-red-950 text-red-300",
};

const STATUS_BADGE: Record<DmcaStatus, string> = {
  pending:   "bg-yellow-950 text-yellow-300",
  reviewing: "bg-blue-950 text-blue-300",
  resolved:  "bg-green-950 text-green-300",
  rejected:  "bg-red-950 text-red-300",
};

export default function AdminDmcaPage() {
  const router = useRouter();

  const [activeTab,    setActiveTab]    = useState<DmcaStatus>("pending");
  const [reports,      setReports]      = useState<DmcaReport[]>([]);
  const [tabCounts,    setTabCounts]    = useState<TabCounts>({ pending: 0, reviewing: 0, resolved: 0, rejected: 0 });
  const [selected,     setSelected]     = useState<DmcaReportDetail | null>(null);
  const [loadingList,  setLoadingList]  = useState(false);
  const [loadingDetail,setLoadingDetail]= useState(false);
  const [saving,       setSaving]       = useState(false);

  // Detail panel edit state
  const [editStatus,   setEditStatus]   = useState<DmcaStatus>("pending");
  const [editPriority, setEditPriority] = useState<DmcaPriority>("normal");
  const [editNotes,    setEditNotes]    = useState("");

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
    try {
      const res  = await fetch(`/api/admin/dmca/${id}`, { headers: getAdminHeaders() });
      const json = await res.json();
      if (res.ok && json.report) {
        const r = json.report as DmcaReportDetail;
        setSelected(r);
        setEditStatus(r.status);
        setEditPriority(r.priority);
        setEditNotes(r.moderator_notes ?? "");
      }
    } finally {
      setLoadingDetail(false);
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
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
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
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab.key
                ? "bg-white text-black"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-xs opacity-70">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-5 min-h-[600px]">
        {/* Left: report list */}
        <div className="flex-1 min-w-0 space-y-2">
          {loadingList ? (
            <div className="text-zinc-500 py-10 text-center text-sm">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="text-zinc-500 py-10 text-center text-sm">No {activeTab} complaints.</div>
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                onClick={() => loadDetail(r.id)}
                className={`w-full text-left rounded-2xl border p-4 transition ${
                  selected?.id === r.id
                    ? "border-white bg-zinc-900"
                    : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {r.first_name} {r.last_name}
                      {r.organization && (
                        <span className="ml-2 font-normal text-zinc-500">· {r.organization}</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{r.email}</p>
                    <p className="text-xs text-zinc-400 truncate mt-1">{r.infringing_content_url}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PRIORITY_BADGE[r.priority]}`}>
                      {r.priority}
                    </span>
                    <span className="text-xs text-zinc-600">{fmtDate(r.created_at)}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: detail panel */}
        <div className="w-[420px] shrink-0">
          {loadingDetail ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-500 text-sm">
              Loading...
            </div>
          ) : selected ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-6 sticky top-4">
              {/* Header */}
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">
                    {selected.first_name} {selected.last_name}
                  </h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[selected.status]}`}>
                    {selected.status}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mt-0.5">{selected.email}</p>
                {selected.organization && (
                  <p className="text-xs text-zinc-500 mt-0.5">{selected.organization}</p>
                )}
                {selected.phone && (
                  <p className="text-xs text-zinc-500 mt-0.5">{selected.phone}</p>
                )}
                <p className="text-xs text-zinc-600 mt-1">Submitted {fmtDate(selected.created_at)}</p>
              </div>

              {/* Copyrighted work */}
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Copyrighted Work</p>
                <p className="text-sm text-zinc-300 leading-6 whitespace-pre-line">{selected.copyrighted_work}</p>
                {selected.original_content_url && (
                  <a
                    href={selected.original_content_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline mt-1 block truncate"
                  >
                    {selected.original_content_url}
                  </a>
                )}
              </div>

              {/* Infringing content */}
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Infringing URL</p>
                <a
                  href={selected.infringing_content_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:underline break-all"
                >
                  {selected.infringing_content_url}
                </a>
              </div>

              {/* Details */}
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Infringement Details</p>
                <p className="text-sm text-zinc-300 leading-6 whitespace-pre-line">{selected.infringement_details}</p>
              </div>

              {/* Evidence */}
              {selected.evidence_signed_urls.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Evidence</p>
                  <ul className="space-y-1">
                    {selected.evidence_signed_urls.map((url, i) => (
                      <li key={i}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
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
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Electronic Signature</p>
                <p className="text-sm font-mono text-zinc-300">{selected.electronic_signature}</p>
              </div>

              {/* Moderation controls */}
              <div className="pt-2 border-t border-zinc-800 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as DmcaStatus)}
                      className="w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    >
                      <option value="pending">Pending</option>
                      <option value="reviewing">Reviewing</option>
                      <option value="resolved">Resolved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Priority</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as DmcaPriority)}
                      className="w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Moderator Notes</label>
                  <textarea
                    rows={4}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-white resize-none"
                    placeholder="Internal notes..."
                  />
                </div>

                {/* Quick action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditStatus("reviewing"); }}
                    className="flex-1 rounded-xl bg-blue-900 text-blue-100 text-xs py-2 hover:bg-blue-800 transition"
                  >
                    Mark Reviewing
                  </button>
                  <button
                    onClick={() => { setEditStatus("resolved"); }}
                    className="flex-1 rounded-xl bg-green-900 text-green-100 text-xs py-2 hover:bg-green-800 transition"
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => { setEditStatus("rejected"); }}
                    className="flex-1 rounded-xl bg-red-900 text-red-100 text-xs py-2 hover:bg-red-800 transition"
                  >
                    Reject
                  </button>
                </div>

                <button
                  onClick={saveDetail}
                  disabled={saving}
                  className="w-full rounded-2xl bg-white text-black font-semibold py-3 text-sm hover:opacity-90 transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>

                {selected.reviewed_at && (
                  <p className="text-xs text-zinc-600 text-center">
                    Last reviewed {fmtDate(selected.reviewed_at)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 border-dashed p-10 text-center text-zinc-600 text-sm">
              Select a complaint to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
