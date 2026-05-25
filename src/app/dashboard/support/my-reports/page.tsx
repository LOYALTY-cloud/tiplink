"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type DmcaReport = {
  id: string;
  infringing_content_url: string;
  copyrighted_work: string;
  status: "pending" | "reviewing" | "resolved" | "rejected";
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
  reviewed_at: string | null;
};

const STATUS_BADGE: Record<DmcaReport["status"], { label: string; cls: string }> = {
  pending:   { label: "Pending Review",    cls: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" },
  reviewing: { label: "Under Review",      cls: "bg-blue-500/20   text-blue-300   border border-blue-500/30"   },
  resolved:  { label: "Resolved",          cls: "bg-green-500/20  text-green-300  border border-green-500/30"  },
  rejected:  { label: "Not Actioned",      cls: "bg-red-500/20    text-red-300    border border-red-500/30"    },
};

const STATUS_DESCRIPTION: Record<DmcaReport["status"], string> = {
  pending:   "Your complaint has been received and is in our review queue.",
  reviewing: "A staff member is actively reviewing your complaint.",
  resolved:  "We have taken action on your complaint. Check your email for details.",
  rejected:  "Your complaint did not meet the requirements for action. Check your email for details.",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function truncateUrl(url: string, max = 60) {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > max ? display.slice(0, max) + "…" : display;
  } catch {
    return url.length > max ? url.slice(0, max) + "…" : url;
  }
}

export default function MyReportsPage() {
  const [reports, setReports] = useState<DmcaReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setError("Please sign in to view your reports.");
        return;
      }
      const res  = await fetch("/api/dmca/my-reports", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load reports.");
        return;
      }
      setReports(json.reports ?? []);
    } catch {
      setError("Failed to load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={ui.page}>
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <Link
          href="/dashboard/support"
          className="text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          ← Support
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60 text-sm">My DMCA Reports</span>
      </div>

      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">My DMCA Reports</h1>
          <p className="text-white/45 text-sm">
            Track the status of copyright complaints you have submitted.
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-white/40 text-sm py-12 justify-center">
            <span className="animate-spin">⟳</span> Loading…
          </div>
        )}

        {!loading && error && (
          <div className={`${ui.card} text-center py-10`}>
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button onClick={loadReports} className={ui.btnGhost}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className={`${ui.card} text-center py-12`}>
            <div className="text-4xl mb-4">⚖️</div>
            <p className="text-white/60 font-medium mb-1">No complaints submitted yet</p>
            <p className="text-white/35 text-sm mb-6">
              Reports you submit while signed in will appear here.
            </p>
            <Link href="/dashboard/support/dmca" className={ui.btnPrimary}>
              File a DMCA Complaint
            </Link>
          </div>
        )}

        {!loading && !error && reports.length > 0 && (
          <div className="space-y-3">
            {reports.map((report) => {
              const badge = STATUS_BADGE[report.status] ?? STATUS_BADGE.pending;
              return (
                <div
                  key={report.id}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl p-5 space-y-3"
                >
                  {/* Top row: badge + date */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-white/30 text-xs">
                      Submitted {fmtDate(report.created_at)}
                      {report.reviewed_at && ` · Reviewed ${fmtDate(report.reviewed_at)}`}
                    </span>
                  </div>

                  {/* Work description */}
                  {report.copyrighted_work && (
                    <div>
                      <p className={`${ui.label} mb-0.5`}>Your copyrighted work</p>
                      <p className="text-white/75 text-sm line-clamp-2">{report.copyrighted_work}</p>
                    </div>
                  )}

                  {/* Infringing URL */}
                  <div>
                    <p className={`${ui.label} mb-0.5`}>Reported URL</p>
                    <p className="text-blue-400/80 text-xs font-mono break-all">
                      {truncateUrl(report.infringing_content_url)}
                    </p>
                  </div>

                  {/* Status description */}
                  <p className="text-white/35 text-xs pt-1 border-t border-white/[0.06]">
                    {STATUS_DESCRIPTION[report.status]}
                  </p>

                  {/* Reference ID */}
                  <p className="text-white/20 text-[11px] font-mono">
                    Ref: {report.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
              );
            })}

            <div className="pt-4 text-center">
              <Link href="/dashboard/support/dmca" className={ui.btnGhost}>
                + Submit another complaint
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
