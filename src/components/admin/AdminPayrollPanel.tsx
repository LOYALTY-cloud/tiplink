"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ui } from "@/lib/ui";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

type AdminPayroll = {
  admin_id: string;
  name: string;
  role: string;
  hours: number;
  rate: number;
};

const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  week: "This Week",
  last_week: "Last Week",
};

const EDITABLE_ROLES = ["support_admin", "finance_admin", "super_admin"];

function fmtHrs(hours: number): string {
  if (hours <= 0) return "0m";
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function AdminPayrollPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AdminPayroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<"today" | "week" | "last_week">("week");
  const [saving, setSaving] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const ref = useRef<HTMLDivElement>(null);
  const isOwner = getAdminSession()?.role === "owner";
  const isLiveRange = range !== "last_week";

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

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/payroll?range=${range}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.admins ?? []);
        setLastUpdated(new Date());
      }
    } catch {}
    if (!silent) setLoading(false);
  }, [range]);

  useEffect(() => {
    if (!open) return;
    void fetchData();
  }, [open, fetchData]);

  // Poll every 30s while open (only for live ranges)
  useEffect(() => {
    if (!open || !isLiveRange) return;
    const interval = setInterval(() => void fetchData(true), 30_000);
    return () => clearInterval(interval);
  }, [open, isLiveRange, fetchData]);

  // Tick every 10s to keep "updated X ago" fresh
  useEffect(() => {
    if (!open || !lastUpdated) return;
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, [open, lastUpdated]);

  const total = data.reduce((sum, a) => sum + a.hours * a.rate, 0);

  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return null;
    const secs = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    if (secs < 10) return "just now";
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  }, [lastUpdated, now]);

  const saveRate = useCallback(async (body: Record<string, unknown>, key: string) => {
    setSaving(key);
    try {
      await fetch("/api/admin/payroll/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify(body),
      });
      await fetchData();
    } catch {}
    setSaving(null);
  }, [fetchData]);

  function handleAdminRate(admin_id: string, value: string) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0) return;
    // Optimistic update
    setData((prev) => prev.map((a) => (a.admin_id === admin_id ? { ...a, rate } : a)));
    saveRate({ admin_id, hourly_rate: rate }, admin_id);
  }

  function handleRoleRate(role: string, value: string) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0) return;
    // Optimistic: update all admins with this role (that don't have a per-admin override — we'll just refresh)
    saveRate({ role, hourly_rate: rate }, role);
  }

  // Derive current role rates from data
  const roleRates: Record<string, number> = {};
  for (const a of data) {
    if (!roleRates[a.role]) roleRates[a.role] = a.rate;
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${ui.btnGhost} ${ui.btnSmall} text-xs shrink-0 ${open ? "text-emerald-400" : ""}`}
      >
        💰 Payroll {open ? "▲" : "▼"}
      </button>

      {/* Panel */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close payroll dropdown"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] sm:hidden"
          />
          <div
            className="fixed left-2 right-2 top-16 max-h-[75vh] overflow-y-auto bg-[#0B1220]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.6)] p-4 z-[70] space-y-3 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[400px] sm:max-w-[calc(100vw-1rem)] sm:max-h-[70vh]"
            style={{ animation: "fadeIn 0.2s ease-out" }}
          >
          {loading && data.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-4">Loading…</p>
          ) : (
            <>
              {/* Header + range */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Payroll</p>
                  {isLiveRange && (
                    <span className="flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Live</span>
                    </span>
                  )}
                  {updatedLabel && (
                    <span className="text-[10px] text-white/25">· {updatedLabel}</span>
                  )}
                </div>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as typeof range)}
                  className="bg-[#0B1220] border border-white/10 rounded-md text-xs px-2 py-1 text-white outline-none focus:border-emerald-500/50 transition"
                >
                  <option value="today" className="bg-[#0B1220] text-white">Today</option>
                  <option value="week" className="bg-[#0B1220] text-white">This Week</option>
                  <option value="last_week" className="bg-[#0B1220] text-white">Last Week</option>
                </select>
              </div>

              {/* Total */}
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-white/40">{RANGE_LABELS[range]} Total</p>
                <p className="text-xl font-bold text-emerald-400">${total.toFixed(2)}</p>
              </div>

              <div className="border-t border-white/10" />

              {/* Admin list */}
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {data.length === 0 && (
                  <p className="text-xs text-white/30 text-center py-3">No payroll data</p>
                )}
                {data.map((admin) => {
                  const pay = admin.hours * admin.rate;
                  return (
                    <div
                      key={admin.admin_id}
                      className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{admin.name}</p>
                        <p className="text-[10px] text-white/30 capitalize">{admin.role.replace("_", " ")}</p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs text-white/60">{fmtHrs(admin.hours)} ×</span>
                            <span className="text-white/40">$</span>
                            {isOwner ? (
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                defaultValue={admin.rate}
                                onBlur={(e) => handleAdminRate(admin.admin_id, e.target.value)}
                                className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-xs text-white text-right outline-none focus:border-emerald-500/50 transition"
                              />
                            ) : (
                              <span className="text-xs text-white">{admin.rate}</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-emerald-400 text-right">
                            ${pay.toFixed(2)}
                          </p>
                        </div>
                        {saving === admin.admin_id && (
                          <span className="text-[10px] text-emerald-400 animate-pulse">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Role defaults — owner only */}
              {isOwner && (
              <div className="border-t border-white/10 pt-2 space-y-1">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Default Rates</p>
                {EDITABLE_ROLES.map((role) => (
                  <div key={role} className="flex items-center justify-between">
                    <span className="text-xs text-white/50 capitalize">{role.replace("_", " ")}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-white/40 text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        defaultValue={roleRates[role] ?? 0}
                        onBlur={(e) => handleRoleRate(role, e.target.value)}
                        className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-xs text-white text-right outline-none focus:border-emerald-500/50 transition"
                      />
                      <span className="text-[10px] text-white/30">/hr</span>
                      {saving === role && (
                        <span className="text-[10px] text-emerald-400 animate-pulse">✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </>
          )}
          </div>
        </>
      )}
    </div>
  );
}
