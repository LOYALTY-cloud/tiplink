"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ui } from "@/lib/ui";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type AdminHours = {
  id: string;
  name: string;
  role: string;
  today_seconds: number;
  week_seconds: number;
  is_active: boolean;
};

type HoursData = {
  admins: AdminHours[];
  total_today: number;
  total_week: number;
  active_count: number;
};

function fmt(seconds: number): string {
  if (seconds < 60) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  week: "This Week",
  last_week: "Last Week",
};

export default function AdminHoursDropdown() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HoursData | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<"today" | "week" | "last_week">("week");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/staff/hours?range=${range}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [range]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, fetchData]);

  async function exportCSV() {
    try {
      const res = await fetch(`/api/admin/staff/hours/export?range=${range}`, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admin-hours-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${ui.btnGhost} ${ui.btnSmall} text-xs shrink-0 ${open ? "text-blue-400" : ""}`}
      >
        🕐 Hours {open ? "▲" : "▼"}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close hours dropdown"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] sm:hidden"
          />
          <div
            className="fixed left-2 right-2 top-16 max-h-[75vh] overflow-y-auto bg-[#0B1220]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.6)] p-4 z-[70] space-y-3 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[320px] sm:max-w-[calc(100vw-1rem)] sm:max-h-[70vh]"
            style={{ animation: "fadeIn 0.2s ease-out" }}
          >
          {loading && !data ? (
            <p className="text-xs text-white/40 text-center py-4">Loading…</p>
          ) : data ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Admin Hours</p>
                <button onClick={fetchData} className="text-[10px] text-white/30 hover:text-white/60 transition">↻</button>
              </div>

              {/* Range selector */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/40">Payroll Period</p>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as typeof range)}
                  className="bg-[#0B1220] border border-white/10 rounded-md text-xs px-2 py-1 text-white outline-none focus:border-blue-500/50 transition"
                >
                  <option value="today" className="bg-[#0B1220] text-white">Today</option>
                  <option value="week" className="bg-[#0B1220] text-white">This Week</option>
                  <option value="last_week" className="bg-[#0B1220] text-white">Last Week</option>
                </select>
              </div>

              {/* Summary */}
              <div className="flex justify-between text-sm font-medium text-white">
                <span>{RANGE_LABELS[range]}: {fmt(data.total_today)}</span>
                <span>Total: {fmt(data.total_week)}</span>
              </div>

              <div className="border-t border-white/10" />

              {/* List */}
              <div className="space-y-1 max-h-[260px] overflow-y-auto">
                {data.admins.length === 0 && (
                  <p className="text-xs text-white/30 text-center py-3">No data yet</p>
                )}
                {data.admins.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-white/5 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${admin.is_active ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{admin.name}</p>
                        <p className="text-[10px] text-white/30 capitalize">{admin.role.replace("_", " ")}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-white">{fmt(admin.week_seconds)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-white/10 pt-2 text-[10px] text-white/30 text-center">
                Active now: {data.active_count}
              </div>

              <button
                onClick={exportCSV}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-2 text-xs text-white transition"
              >
                Export {RANGE_LABELS[range]} CSV
              </button>
            </>
          ) : (
            <p className="text-xs text-red-400 text-center py-3">Failed to load</p>
          )}
          </div>
        </>
      )}
    </div>
  );
}
