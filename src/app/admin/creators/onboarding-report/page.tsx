"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

type ReportRow = {
  category_key: string;
  category_label: string;
  category_group: string;
  creators_total: number;
  onboarding_complete: number;
  onboarding_incomplete: number;
  completion_rate: number;
};

type ReportPayload = {
  totals: {
    creators_total: number;
    onboarding_complete: number;
    onboarding_incomplete: number;
    overall_completion_rate: number;
  };
  by_category: ReportRow[];
  filter?: {
    range: string;
  };
  generated_at: string;
};

type RangeFilter = "all" | "7" | "30" | "90";

function barWidth(rate: number) {
  return `${Math.max(0, Math.min(100, rate))}%`;
}

export default function AdminCreatorOnboardingReportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [range, setRange] = useState<RangeFilter>("all");

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      window.location.href = "/admin/login";
      return;
    }
    void loadReport("all");
  }, []);

  useEffect(() => {
    void loadReport(range);
  }, [range]);

  async function loadReport(nextRange: RangeFilter = range) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ range: nextRange });
      const res = await fetch(`/api/admin/creators/onboarding-report?${qs.toString()}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load report");
      setReport(json as ReportPayload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!report) return;

    const rows = [
      ["Category", "Creators", "Onboarding complete", "Onboarding incomplete", "Completion rate %"],
      ...report.by_category.map((r) => [
        r.category_label,
        String(r.creators_total),
        String(r.onboarding_complete),
        String(r.onboarding_incomplete),
        String(r.completion_rate),
      ]),
      [],
      ["Total creators", String(report.totals.creators_total)],
      ["Total complete", String(report.totals.onboarding_complete)],
      ["Total incomplete", String(report.totals.onboarding_incomplete)],
      ["Overall completion rate %", String(report.totals.overall_completion_rate)],
      ["Range", range],
      ["Generated at", report.generated_at],
    ];

    const csv = rows
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creator-onboarding-report-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-black text-white px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Creator Onboarding Report</h1>
          <p className="text-white/50 text-sm mt-1">
            Creator activity category distribution and Stripe onboarding completion rate by category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeFilter)}
            className="rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm text-white"
          >
            <option value="all" className="bg-black">All time</option>
            <option value="7" className="bg-black">Last 7 days</option>
            <option value="30" className="bg-black">Last 30 days</option>
            <option value="90" className="bg-black">Last 90 days</option>
          </select>
          <button
            onClick={() => void loadReport()}
            className="rounded-xl bg-white/10 hover:bg-white/20 text-white px-4 py-2 text-sm transition"
          >
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!report || loading}
            className="rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 px-4 py-2 text-sm transition disabled:opacity-50"
          >
            Export CSV
          </button>
          <Link
            href="/admin/creators"
            className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold hover:bg-white/90 transition"
          >
            Back to Creators
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-white/40">Loading report...</div>
      ) : !report ? (
        <div className="text-white/40">No report data available.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total creators" value={String(report.totals.creators_total)} />
            <StatCard label="Onboarding complete" value={String(report.totals.onboarding_complete)} />
            <StatCard label="Onboarding incomplete" value={String(report.totals.onboarding_incomplete)} />
            <StatCard label="Overall completion" value={`${report.totals.overall_completion_rate}%`} />
          </div>

          <p className="text-xs text-white/50">
            Report range: {range === "all" ? "All time" : `Last ${range} days`} • Generated: {new Date(report.generated_at).toLocaleString()}
          </p>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-white/55 border-b border-white/10">
              <div className="col-span-4">Category</div>
              <div className="col-span-2 text-right">Creators</div>
              <div className="col-span-2 text-right">Complete</div>
              <div className="col-span-2 text-right">Incomplete</div>
              <div className="col-span-2 text-right">Completion</div>
            </div>

            {report.by_category.length === 0 ? (
              <div className="px-4 py-6 text-sm text-white/50">No creators found yet.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {report.by_category.map((row) => (
                  <div key={row.category_key} className="px-4 py-4 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center text-sm">
                      <div className="col-span-4">
                        <p className="font-medium text-white/90">{row.category_label}</p>
                        <p className="text-[11px] text-white/45">{row.category_group}</p>
                      </div>
                      <div className="col-span-2 text-right text-white/80">{row.creators_total}</div>
                      <div className="col-span-2 text-right text-emerald-400">{row.onboarding_complete}</div>
                      <div className="col-span-2 text-right text-yellow-300">{row.onboarding_incomplete}</div>
                      <div className="col-span-2 text-right font-semibold text-cyan-300">{row.completion_rate}%</div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                        style={{ width: barWidth(row.completion_rate) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
