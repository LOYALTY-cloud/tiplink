"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAdminSession, getAdminHeaders } from "@/lib/auth/adminSession";

type Status = "applied" | "reviewing" | "interview" | "offer" | "hired" | "rejected";

type Note = {
  id: string;
  note: string;
  admin_id: string;
  created_at: string;
};

type Application = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  portfolio: string | null;
  linkedin: string | null;
  salary: string | null;
  years_experience: string | null;
  experience: string;
  system_built: string;
  why: string;
  why_role: string | null;
  company_mission: string | null;
  school: string | null;
  degree: string | null;
  discipline: string | null;
  additional_profiles: string | null;
  previously_employed: string | null;
  professional_references: string | null;
  status: Status;
  resume_url: string | null;
  cover_letter_url: string | null;
  ai_score: number | null;
  ai_summary: string | null;
  interview_link: string | null;
  risk_score: number | null;
  risk_flags: string[] | null;
  created_at: string;
};

const PIPELINE: Status[] = ["applied", "reviewing", "interview", "offer", "hired"];

const COLUMN_STYLE: Record<Status, { header: string; card: string; dot: string; badge: string }> = {
  applied:   { header: "text-white/60",   card: "border-white/10",       dot: "bg-white/30",    badge: "bg-white/10 text-white/50 border-white/10" },
  reviewing: { header: "text-blue-400",   card: "border-blue-500/20",    dot: "bg-blue-400",    badge: "bg-blue-500/15 text-blue-300 border-blue-500/20" },
  interview: { header: "text-yellow-400", card: "border-yellow-500/20",  dot: "bg-yellow-400",  badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/20" },
  offer:     { header: "text-purple-400", card: "border-purple-500/20",  dot: "bg-purple-400",  badge: "bg-purple-500/15 text-purple-300 border-purple-500/20" },
  hired:     { header: "text-green-400",  card: "border-green-500/20",   dot: "bg-green-400",   badge: "bg-green-500/15 text-green-300 border-green-500/20" },
  rejected:  { header: "text-red-400",    card: "border-red-500/20",     dot: "bg-red-400",     badge: "bg-red-500/15 text-red-300 border-red-500/20" },
};

const NEXT_ACTIONS: { label: string; status: Status; cls: string }[] = [
  { label: "Move to Review",     status: "reviewing", cls: "bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border-blue-500/30" },
  { label: "Schedule Interview", status: "interview", cls: "bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border-yellow-500/30" },
  { label: "Send Offer",         status: "offer",     cls: "bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/30" },
  { label: "Hire",               status: "hired",     cls: "bg-green-500/20 hover:bg-green-500/30 text-green-300 border-green-500/30" },
  { label: "Reject",             status: "rejected",  cls: "bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/30" },
];

export default function AdminApplicantsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [showRejected, setShowRejected] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewType, setInterviewType] = useState("zoom");
  const [schedulingInterview, setSchedulingInterview] = useState(false);
  const [interviewLinkInput, setInterviewLinkInput] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSent, setInviteSent] = useState<string | null>(null); // id of last sent
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewGenRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = getAdminSession();
    if (!s) { router.replace("/admin/login"); return; }
    if (!["owner", "super_admin"].includes(s.role)) { router.replace("/admin"); return; }
    loadApps();
  }, []);

  useEffect(() => {
    if (!selected) { setNotes([]); setPreviewUrl(null); setInterviewLinkInput(""); setInviteSent(null); setInterviewDate(""); setInterviewType("zoom"); return; }
    loadNotes(selected.id);
    setInterviewLinkInput(selected.interview_link ?? "");
    setInterviewDate("");
    setInterviewType("zoom");
    setInviteSent(null);
    if (selected.resume_url) loadPreview(selected.id);
    else setPreviewUrl(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function clearAllApps() {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/applications", {
        method: "DELETE",
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to clear applications.");
      } else {
        setApps([]);
        setSelected(null);
      }
    } catch {
      setError("Failed to clear applications.");
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  }

  async function loadApps() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/applications", { headers: getAdminHeaders() });
      if (!res.ok) throw new Error();
      setApps(await res.json());
    } catch {
      setError("Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: Status) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status } : prev);
    } catch {
      setError("Failed to update status.");
    } finally {
      setUpdating(false);
    }
  }

  async function downloadFile(id: string, fileKey: "resume" | "cover_letter") {
    setDownloadingFile(fileKey);
    try {
      const res = await fetch(`/api/admin/applications/${id}/files`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error();
      const urls: Record<string, string> = await res.json();
      // Prefer the dedicated download URL (sets content-disposition: attachment)
      const url = urls[`${fileKey}_download`] ?? urls[fileKey];
      if (!url) throw new Error();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not generate download link.");
    } finally {
      setDownloadingFile(null);
    }
  }

  async function loadNotes(id: string) {
    try {
      const res = await fetch(`/api/admin/applications/${id}/notes`, { headers: getAdminHeaders() });
      if (!res.ok) return;
      setNotes(await res.json());
    } catch { /* silent */ }
  }

  async function saveNote(id: string) {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/applications/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      if (!res.ok) throw new Error();
      const data: Note = await res.json();
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    } catch {
      setError("Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function scheduleInterview(id: string) {
    if (!interviewDate) return;
    setSchedulingInterview(true);
    try {
      const res = await fetch(`/api/admin/applications/${id}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ date: interviewDate, type: interviewType, interview_link: interviewLinkInput || undefined }),
      });
      if (!res.ok) throw new Error();
      const link = interviewLinkInput || null;
      setApps((prev) => prev.map((a) => a.id === id ? { ...a, status: "interview" as Status, interview_link: link } : a));
      if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status: "interview" as Status, interview_link: link } : prev);
      setInterviewDate("");
    } catch {
      setError("Failed to schedule interview.");
    } finally {
      setSchedulingInterview(false);
    }
  }

  async function saveMeetingLink(id: string) {
    setSavingLink(true);
    try {
      const res = await fetch(`/api/admin/applications/${id}/interview`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ interview_link: interviewLinkInput }),
      });
      if (!res.ok) throw new Error();
      setApps((prev) => prev.map((a) => a.id === id ? { ...a, interview_link: interviewLinkInput || null } : a));
      if (selected?.id === id) setSelected((prev) => prev ? { ...prev, interview_link: interviewLinkInput || null } : prev);
    } catch {
      setError("Failed to save meeting link.");
    } finally {
      setSavingLink(false);
    }
  }

  async function sendInterviewInvite(id: string) {
    const schedulingUrl = process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/1nelink/interview";
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/admin/applications/${id}/send-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ scheduling_link: schedulingUrl, meeting_link: interviewLinkInput || undefined }),
      });
      if (!res.ok) throw new Error();
      setInviteSent(id);
    } catch {
      setError("Failed to send invite email.");
    } finally {
      setSendingInvite(false);
    }
  }

  async function generateScore(id: string) {
    setScoringId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}/score`, {
        method: "POST",
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error();
      const { score, summary } = await res.json() as { score: number; summary: string };
      setApps((prev) => prev.map((a) => a.id === id ? { ...a, ai_score: score, ai_summary: summary } : a));
      if (selected?.id === id) setSelected((prev) => prev ? { ...prev, ai_score: score, ai_summary: summary } : prev);
    } catch {
      setError("AI scoring failed. Please try again.");
    } finally {
      setScoringId(null);
    }
  }

  async function loadPreview(id: string) {
    const gen = ++previewGenRef.current;
    setLoadingPreview(true);
    setPreviewUrl(null);
    try {
      const res = await fetch(`/api/admin/applications/${id}/files`, { headers: getAdminHeaders() });
      if (!res.ok) return;
      const urls = await res.json() as Record<string, string>;
      if (gen !== previewGenRef.current) return; // stale — another candidate was selected
      if (urls.resume) setPreviewUrl(urls.resume);
    } catch { /* silent */ } finally {
      if (gen === previewGenRef.current) setLoadingPreview(false);
    }
  }

  /** Returns true if the signed URL points to a PDF file */
  function isPdfUrl(url: string): boolean {
    try {
      const pathname = new URL(url).pathname;
      return pathname.toLowerCase().endsWith(".pdf");
    } catch {
      return url.toLowerCase().includes(".pdf");
    }
  }

  /** Only allow https:// URLs to be used as href values — prevents javascript: / data: injection */
  function safeHref(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith("https://") ? url : null;
  }

  const roles = Array.from(new Set(apps.map((a) => a.role))).sort();

  function getColumn(status: Status) {
    return apps.filter((a) => {
      if (a.status !== status) return false;
      if (filterRole !== "all" && a.role !== filterRole) return false;
      if (search && !`${a.name} ${a.email} ${a.role}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
  }

  const columns = showRejected ? [...PIPELINE, "rejected" as Status] : PIPELINE;

  return (
    <div className="flex h-screen bg-[#050A1A] text-white overflow-hidden">

      {/* ── PIPELINE ── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/10">
          <h1 className="text-sm font-semibold text-white/80 shrink-0">HIRING APPLICATION</h1>
          <div className="flex-1" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates…"
            className="text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-48"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="text-xs bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          >
            <option value="all">All roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={() => setShowRejected((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
              showRejected
                ? "bg-red-500/20 border-red-500/30 text-red-300"
                : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"
            }`}
          >
            {showRejected ? "Hide Rejected" : "Show Rejected"}
          </button>
          <button
            onClick={loadApps}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/40 hover:text-white/70 transition"
          >
            Refresh
          </button>
          {clearConfirm ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-red-300">Delete all applications?</span>
              <button
                onClick={clearAllApps}
                disabled={clearing}
                className="px-3 py-1.5 rounded-lg bg-red-500/30 hover:bg-red-500/50 text-red-200 border border-red-500/40 disabled:opacity-50 transition"
              >
                {clearing ? "Clearing…" : "Yes, delete all"}
              </button>
              <button
                onClick={() => setClearConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 border border-white/10 transition"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setClearConfirm(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
            >
              Clear All
            </button>
          )}
        </div>

        {error && (
          <div className="mx-4 mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 shrink-0 flex items-center justify-between">
            {error}
            <button onClick={() => setError(null)} className="ml-3 text-red-300/60 hover:text-red-300">✕</button>
          </div>
        )}

        {/* Kanban board */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 p-4 h-full min-w-max">
            {loading ? (
              <div className="flex items-center justify-center w-full text-white/30 text-sm">Loading…</div>
            ) : columns.map((col) => {
              const cards = getColumn(col);
              const style = COLUMN_STYLE[col];
              return (
                <div key={col} className="w-60 shrink-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wide ${style.header}`}>{col}</span>
                    <span className="ml-auto text-xs text-white/25 tabular-nums">{cards.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-0.5">
                    {cards.length === 0 && (
                      <div className="text-xs text-white/15 text-center py-6 border border-dashed border-white/5 rounded-xl">—</div>
                    )}
                    {cards.map((app) => (
                      <button
                        key={app.id}
                        onClick={() => {
                          setSelected(app);
                          setTimeout(() => panelRef.current?.scrollTo(0, 0), 0);
                        }}
                        className={`w-full text-left rounded-xl bg-white/[0.04] border ${style.card} ${
                          selected?.id === app.id ? "ring-1 ring-blue-500/40 bg-white/[0.07]" : ""
                        } p-3 hover:bg-white/[0.07] transition`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium truncate">{app.name}</p>
                          {app.ai_score != null && (
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              app.ai_score >= 80 ? "text-green-400 bg-green-500/10" :
                              app.ai_score >= 60 ? "text-yellow-400 bg-yellow-500/10" :
                              "text-red-400 bg-red-500/10"
                            }`}>{app.ai_score}</span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 truncate mt-0.5">{app.role}</p>
                        {app.resume_url && <span className="mt-1.5 inline-block text-[10px] text-blue-400/60">📄 resume</span>}
                        {app.risk_score != null && app.risk_score >= 40 && (
                          <span className="mt-1 inline-block text-[10px] text-red-400/70">⚠ risk:{app.risk_score}</span>
                        )}
                        <p className="text-[10px] text-white/20 mt-1">{new Date(app.created_at).toLocaleDateString()}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── DETAIL PANEL ── */}
      {selected && (
        <div ref={panelRef} className="w-[420px] shrink-0 border-l border-white/10 flex flex-col overflow-y-auto bg-[#060c1e]">
          {/* Panel header */}
          <div className="sticky top-0 bg-[#060c1e] z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
            <div className="min-w-0">
              <h2 className="font-semibold text-sm truncate">{selected.name}</h2>
              <p className="text-xs text-white/40 truncate">{selected.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${COLUMN_STYLE[selected.status].badge}`}>
                {selected.status}
              </span>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white/70 transition text-xl leading-none">✕</button>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5">
            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: "Role",       value: selected.role },
                { label: "Applied",    value: new Date(selected.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                ...(selected.salary ? [{ label: "Salary Req.", value: selected.salary }] : []),
                ...(selected.phone  ? [{ label: "Phone",       value: selected.phone }] : []),
                ...(selected.school ? [{ label: "Education",   value: [selected.degree, selected.school].filter(Boolean).join(" · ") }] : []),
                ...(selected.previously_employed === "yes" ? [{ label: "Prior 1neLink", value: "Yes" }] : []),
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-white/[0.04] border border-white/8 px-3 py-2">
                  <p className="text-[10px] text-white/35 uppercase tracking-wide">{label}</p>
                  <p className="text-xs text-white/80 mt-0.5 font-medium">{value}</p>
                </div>
              ))}
            </div>

            {/* Risk Banner */}
            {selected.risk_score != null && selected.risk_score > 0 && (
              <div className={`rounded-xl border px-4 py-3 ${
                selected.risk_score >= 50
                  ? "bg-red-500/10 border-red-500/25"
                  : "bg-yellow-500/10 border-yellow-500/25"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-xs font-semibold ${
                    selected.risk_score >= 50 ? "text-red-400" : "text-yellow-400"
                  }`}>⚠ Risk Score: {selected.risk_score}/100</p>
                </div>
                {selected.risk_flags && selected.risk_flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selected.risk_flags.map((flag) => (
                      <span key={flag} className={`text-[10px] px-2 py-0.5 rounded border ${
                        selected.risk_score! >= 50
                          ? "bg-red-500/10 border-red-500/20 text-red-300"
                          : "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                      }`}>{flag.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI Evaluation */}
            <div className="rounded-xl bg-white/[0.04] border border-white/8 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-white/35 uppercase tracking-wide">AI Evaluation</p>
                <button
                  onClick={() => generateScore(selected.id)}
                  disabled={scoringId === selected.id}
                  className="text-[10px] px-2 py-1 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition disabled:opacity-50"
                >
                  {scoringId === selected.id ? "Scoring…" : selected.ai_score != null ? "↺ Re-score" : "✨ Generate Score"}
                </button>
              </div>
              {selected.ai_score != null ? (
                <div className="flex items-start gap-3">
                  <div className={`text-2xl font-bold tabular-nums shrink-0 ${
                    selected.ai_score >= 80 ? "text-green-400" :
                    selected.ai_score >= 60 ? "text-yellow-400" : "text-red-400"
                  }`}>{selected.ai_score}<span className="text-xs font-normal text-white/25">/100</span></div>
                  <p className="text-xs text-white/60 leading-relaxed">{selected.ai_summary}</p>
                </div>
              ) : (
                <p className="text-xs text-white/20">No score yet. Click ✨ Generate Score to evaluate with AI.</p>
              )}
            </div>

            {/* Documents */}
            {(selected.resume_url || selected.cover_letter_url) && (
              <div>
                <p className="text-[10px] text-white/35 uppercase tracking-wide mb-2">Documents</p>
                <div className="flex gap-2">
                  {selected.resume_url && (
                    <button
                      onClick={() => downloadFile(selected.id, "resume")}
                      disabled={downloadingFile === "resume"}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-300 hover:bg-blue-500/25 transition disabled:opacity-50"
                    >
                      {downloadingFile === "resume" ? "Generating…" : "↓ Resume"}
                    </button>
                  )}
                  {selected.cover_letter_url && (
                    <button
                      onClick={() => downloadFile(selected.id, "cover_letter")}
                      disabled={downloadingFile === "cover_letter"}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.07] border border-white/10 text-white/60 hover:bg-white/[0.12] transition disabled:opacity-50"
                    >
                      {downloadingFile === "cover_letter" ? "Generating…" : "↓ Cover Letter"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Resume Preview */}
            {selected.resume_url && (
              <div>
                <p className="text-[10px] text-white/35 uppercase tracking-wide mb-2">Resume Preview</p>
                {loadingPreview && !previewUrl ? (
                  <div className="w-full h-16 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
                    <p className="text-xs text-white/25">Loading preview…</p>
                  </div>
                ) : previewUrl ? (
                  isPdfUrl(previewUrl) ? (
                    /* Native PDF rendering — works with any accessible URL including Supabase signed URLs */
                    <iframe
                      src={previewUrl}
                      className="w-full h-[480px] rounded-xl border border-white/10 bg-black"
                      title="Resume Preview"
                    />
                  ) : (
                    /* Google Docs Viewer for .doc / .docx */
                    <iframe
                      src={`https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(previewUrl)}`}
                      className="w-full h-[480px] rounded-xl border border-white/10 bg-black"
                      title="Resume Preview"
                    />
                  )
                ) : null}
              </div>
            )}

            {/* Links */}
            {(selected.portfolio || selected.additional_profiles || selected.linkedin) && (
              <div>
                <p className="text-[10px] text-white/35 uppercase tracking-wide mb-2">Links</p>
                <div className="flex flex-col gap-1.5">
                  {selected.linkedin && safeHref(selected.linkedin) && (
                    <a href={safeHref(selected.linkedin)!} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 transition">
                      LinkedIn ↗
                    </a>
                  )}
                  {selected.portfolio && safeHref(selected.portfolio) && (
                    <a href={safeHref(selected.portfolio)!} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 transition">
                      Portfolio ↗
                    </a>
                  )}
                  {selected.additional_profiles && (
                    <p className="text-xs text-white/50 break-all">{selected.additional_profiles}</p>
                  )}
                </div>
              </div>
            )}

            {/* Long-form answers */}
            {([
              { label: "Experience",      value: selected.experience },
              { label: "System Built",    value: selected.system_built },
              { label: "Why This Role",   value: selected.why_role },
              { label: "Why 1neLink",     value: selected.why },
              { label: "Company Mission", value: selected.company_mission },
              { label: "References",      value: selected.professional_references },
            ] as { label: string; value: string | null }[]).filter(({ value }) => value).map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-white/[0.04] border border-white/8 px-4 py-3">
                <p className="text-[10px] text-white/35 uppercase tracking-wide mb-1.5">{label}</p>
                <p className="text-xs text-white/75 leading-relaxed whitespace-pre-wrap">{value}</p>
              </div>
            ))}

            {/* Pipeline actions */}
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wide mb-2">Move to Stage</p>
              <div className="flex flex-wrap gap-2">
                {NEXT_ACTIONS.map(({ label, status, cls }) => (
                  <button
                    key={status}
                    disabled={updating || selected.status === status}
                    onClick={() => updateStatus(selected.id, status)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interview Scheduling */}
            <div className="rounded-xl bg-white/[0.04] border border-white/8 px-4 py-3">
              <p className="text-[10px] text-white/35 uppercase tracking-wide mb-3">Interview</p>
              <div className="flex flex-col gap-3">

                {/* Log interview time */}
                <div>
                  <p className="text-[10px] text-white/25 mb-1.5">Log interview time</p>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={interviewDate}
                      onChange={(e) => setInterviewDate(e.target.value)}
                      className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
                    />
                    <select
                      value={interviewType}
                      onChange={(e) => setInterviewType(e.target.value)}
                      className="text-xs bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none"
                    >
                      <option value="zoom">Zoom</option>
                      <option value="phone">Phone</option>
                      <option value="in-person">In-Person</option>
                    </select>
                  </div>
                  <button
                    onClick={() => scheduleInterview(selected.id)}
                    disabled={!interviewDate || schedulingInterview}
                    className="mt-2 w-full text-xs px-3 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 transition disabled:opacity-40"
                  >
                    {schedulingInterview ? "Saving…" : "Log & Move to Interview"}
                  </button>
                </div>

                <div className="border-t border-white/8" />

                {/* Meeting link */}
                <div>
                  <p className="text-[10px] text-white/25 mb-1.5">Meeting link (Zoom / Google Meet)</p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={interviewLinkInput}
                      onChange={(e) => setInterviewLinkInput(e.target.value)}
                      placeholder="https://zoom.us/j/..."
                      className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                    <button
                      onClick={() => saveMeetingLink(selected.id)}
                      disabled={savingLink}
                      className="text-xs px-3 py-2 rounded-lg bg-white/[0.07] border border-white/10 text-white/50 hover:text-white/80 transition disabled:opacity-40 shrink-0"
                    >
                      {savingLink ? "…" : "Save"}
                    </button>
                  </div>
                  {selected.interview_link && safeHref(selected.interview_link) && (
                    <a
                      href={safeHref(selected.interview_link)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-block text-[11px] text-blue-400 hover:text-blue-300 transition"
                    >
                      Join meeting →
                    </a>
                  )}
                </div>

                <div className="border-t border-white/8" />

                {/* Email candidate */}
                <div>
                  <p className="text-[10px] text-white/25 mb-1.5">Send scheduling invite to candidate</p>
                  <button
                    onClick={() => sendInterviewInvite(selected.id)}
                    disabled={sendingInvite || inviteSent === selected.id}
                    className={`w-full text-xs px-3 py-2 rounded-lg border transition font-medium ${
                      inviteSent === selected.id
                        ? "bg-green-500/15 border-green-500/25 text-green-400 cursor-default"
                        : "bg-yellow-500/20 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 disabled:opacity-40"
                    }`}
                  >
                    {inviteSent === selected.id ? "✓ Invite sent" : sendingInvite ? "Sending…" : "📧 Email Scheduling Link to Candidate"}
                  </button>
                  <p className="mt-1.5 text-[10px] text-white/20">Sends a branded email with your Calendly / scheduling URL.</p>
                </div>

              </div>
            </div>

            {/* Internal Notes */}
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wide mb-2">Internal Notes</p>
              <div className="flex gap-2 mb-3">
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(selected.id); } }}
                  placeholder="Add internal note…"
                  className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
                <button
                  onClick={() => saveNote(selected.id)}
                  disabled={!newNote.trim() || savingNote}
                  className="text-xs px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition disabled:opacity-40"
                >
                  {savingNote ? "…" : "Add"}
                </button>
              </div>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-xs text-white/20 text-center py-3">No notes yet.</p>
                ) : notes.map((n) => (
                  <div key={n.id} className="bg-white/[0.04] border border-white/8 rounded-lg px-3 py-2">
                    <p className="text-xs text-white/75 leading-relaxed">{n.note}</p>
                    <p className="text-[10px] text-white/25 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


