"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminSession, getAdminHeaders } from "@/lib/auth/adminSession";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, format, addMonths, subMonths, isToday,
} from "date-fns";

type Interview = {
  id: string;
  date: string;
  type: string;
  meeting_link: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  application_id: string;
  applications: { name: string; email: string; role: string; status: string } | null;
};

const TYPE_CHIP: Record<string, string> = {
  zoom:        "bg-blue-500/10 text-blue-300 hover:bg-blue-500/20",
  phone:       "bg-green-500/10 text-green-300 hover:bg-green-500/20",
  "in-person": "bg-purple-500/10 text-purple-300 hover:bg-purple-500/20",
};
const TYPE_CHIP_SELECTED: Record<string, string> = {
  zoom:        "bg-blue-500/30 text-blue-200",
  phone:       "bg-green-500/30 text-green-200",
  "in-person": "bg-purple-500/30 text-purple-200",
};

export default function AdminInterviewCalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate]     = useState(new Date());
  const [interviews, setInterviews]       = useState<Interview[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [selected, setSelected]           = useState<Interview | null>(null);

  useEffect(() => {
    const s = getAdminSession();
    if (!s) { router.replace("/admin/login"); return; }
    if (!["owner", "super_admin"].includes(s.role)) { router.replace("/admin"); return; }
    loadInterviews();
  }, [currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadInterviews() {
    setLoading(true);
    setError(null);
    try {
      const from = startOfMonth(currentDate).toISOString();
      const to   = endOfMonth(currentDate).toISOString();
      const res = await fetch(
        `/api/admin/interviews?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: getAdminHeaders() }
      );
      if (!res.ok) throw new Error();
      const raw: Interview[] = await res.json();
      setInterviews(raw);
    } catch {
      setError("Failed to load interviews.");
    } finally {
      setLoading(false);
    }
  }

  // Build calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }

  function getInterviewsForDay(day: Date) {
    return interviews.filter((i) => isSameDay(new Date(i.date), day));
  }

  function resolveName(i: Interview) {
    return i.candidate_name || i.applications?.name || "Unknown";
  }
  function resolveRole(i: Interview) {
    return i.applications?.role || "";
  }

  const upcomingThisMonth = interviews
    .filter((i) => new Date(i.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#050A1A] text-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Interview Calendar</h1>
            <p className="text-xs text-white/40 mt-0.5">{interviews.length} interview{interviews.length !== 1 ? "s" : ""} this month</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition"
            >←</button>
            <span className="text-sm font-semibold w-32 text-center">{format(currentDate, "MMMM yyyy")}</span>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition"
            >→</button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-white/50 hover:text-white/80 transition"
            >Today</button>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

          {/* Calendar grid */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/8 overflow-hidden">

            {/* Day labels */}
            <div className="grid grid-cols-7 border-b border-white/8">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-[10px] text-white/30 text-center py-2 font-medium uppercase tracking-wider">{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64 text-white/25 text-sm">Loading…</div>
            ) : (
              <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                  const dayInterviews = getInterviewsForDay(day);
                  const inMonth = isSameMonth(day, currentDate);
                  const today   = isToday(day);
                  return (
                    <div
                      key={idx}
                      className={`min-h-[90px] p-2 border-b border-r border-white/[0.04] ${
                        !inMonth ? "opacity-30" : ""
                      }`}
                    >
                      <div className={`text-xs font-medium mb-1.5 w-6 h-6 flex items-center justify-center rounded-full ${
                        today ? "bg-blue-500 text-white" : "text-white/50"
                      }`}>
                        {format(day, "d")}
                      </div>
                      <div className="flex flex-col gap-1">
                        {dayInterviews.map((i) => (
                          <button
                            key={i.id}
                            onClick={() => setSelected(i)}
                            className={`text-left w-full rounded px-1.5 py-0.5 text-[10px] truncate transition ${
                              selected?.id === i.id
                                ? (TYPE_CHIP_SELECTED[i.type] ?? "bg-white/20 text-white/80")
                                : (TYPE_CHIP[i.type] ?? "bg-white/[0.06] text-white/50 hover:bg-white/[0.10]")
                            }`}
                          >
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                              i.type === "zoom" ? "bg-blue-400" : i.type === "phone" ? "bg-green-400" : i.type === "in-person" ? "bg-purple-400" : "bg-white/30"
                            }`} />
                            {format(new Date(i.date), "h:mm a")} · {resolveName(i).split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="flex flex-col gap-4">

            {/* Interview detail */}
            {selected ? (
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Interview Details</p>
                  <button onClick={() => setSelected(null)} className="text-white/25 hover:text-white/60 text-lg leading-none">✕</button>
                </div>
                <p className="font-semibold text-sm">{resolveName(selected)}</p>
                <p className="text-xs text-white/40 mt-0.5 mb-3">{resolveRole(selected)}</p>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 w-16 shrink-0">Date</span>
                    <span className="text-white/80">{format(new Date(selected.date), "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 w-16 shrink-0">Time</span>
                    <span className="text-white/80">{format(new Date(selected.date), "h:mm a")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 w-16 shrink-0">Format</span>
                    <span className="capitalize text-white/80">{selected.type}</span>
                  </div>
                  {selected.candidate_email || selected.applications?.email ? (
                    <div className="flex items-center gap-2">
                      <span className="text-white/30 w-16 shrink-0">Email</span>
                      <span className="text-white/60 truncate">{selected.candidate_email ?? selected.applications?.email}</span>
                    </div>
                  ) : null}
                </div>

                {selected.meeting_link && (
                  <a
                    href={selected.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 w-full text-xs px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition font-medium"
                  >
                    Join Meeting →
                  </a>
                )}

                <button
                  onClick={() => router.push(`/admin/applicants`)}
                  className="mt-2 w-full text-xs px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-white/40 hover:text-white/70 transition"
                >
                  View in Pipeline
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4">
                <p className="text-[10px] text-white/25 uppercase tracking-wide text-center">Click an interview to view details</p>
              </div>
            )}

            {/* Upcoming */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4">
              <p className="text-[10px] text-white/35 uppercase tracking-wide mb-3">Upcoming</p>
              {upcomingThisMonth.length === 0 ? (
                <p className="text-xs text-white/20 text-center py-2">No upcoming interviews</p>
              ) : upcomingThisMonth.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setSelected(i)}
                  className="w-full flex items-center gap-2 text-left py-2 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition rounded px-1"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    i.type === "zoom" ? "bg-blue-400" : i.type === "phone" ? "bg-green-400" : i.type === "in-person" ? "bg-purple-400" : "bg-white/30"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{resolveName(i)}</p>
                    <p className="text-[10px] text-white/35">{format(new Date(i.date), "MMM d · h:mm a")}</p>
                  </div>
                </button>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
