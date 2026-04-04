"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAdminSession, getAdminHeaders } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type Override = {
  id: string;
  admin_id: string;
  admin_name: string;
  target_user: string;
  target_name: string;
  override_type: string;
  previous_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  reason: string;
  created_at: string;
};

const OVERRIDE_LABELS: Record<string, string> = {
  override_withdrawal_limit: "Withdrawal Limit → Unlimited",
  unlock_withdrawal: "Unlock Withdrawal",
  unflag: "Unflag User",
  clear_restriction: "Clear Restriction",
  bypass_verification: "Bypass Verification",
  override_risk_score: "Reset Risk Score",
  manual_flag: "Manual Flag",
};

const SEVERITY_COLORS: Record<string, string> = {
  override_withdrawal_limit: "text-red-400 bg-red-500/10 border-red-500/20",
  unlock_withdrawal: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  manual_flag: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  unflag: "text-green-400 bg-green-500/10 border-green-500/20",
  clear_restriction: "text-green-400 bg-green-500/10 border-green-500/20",
  bypass_verification: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  override_risk_score: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const PAGE_SIZE = 25;

export default function OverridesPage() {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) { router.replace("/admin/login"); return; }
    const allowed = ["owner", "super_admin", "finance_admin"];
    if (!allowed.includes(session.role)) { router.replace("/admin"); return; }
    fetchOverrides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, page, typeFilter]);

  async function fetchOverrides() {
    setLoading(true);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (typeFilter) params.set("type", typeFilter);

    const res = await fetch(`/api/admin/overrides?${params}`, { headers });
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    setOverrides(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className={ui.h2}>Admin Overrides</h1>
          <p className={`text-sm ${ui.muted2} mt-1`}>
            Audit trail of all privileged overrides · {total} total
          </p>
        </div>

        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          className={`${ui.select} !w-auto !py-2 !px-3 !text-sm`}
        >
          <option value="">All Types</option>
          <option value="override_withdrawal_limit">Withdrawal Limit Override</option>
          <option value="unlock_withdrawal">Unlock Withdrawal</option>
          <option value="unflag">Unflag</option>
          <option value="clear_restriction">Clear Restriction</option>
          <option value="bypass_verification">Bypass Verification</option>
          <option value="override_risk_score">Reset Risk Score</option>
          <option value="manual_flag">Manual Flag</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16">
          <p className={ui.muted}>Loading…</p>
        </div>
      ) : overrides.length === 0 ? (
        <div className={`${ui.card} p-8 text-center`}>
          <p className={ui.muted}>No overrides found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {overrides.map((o) => {
            const isExpanded = expanded === o.id;
            const colors = SEVERITY_COLORS[o.override_type] ?? "text-white/70 bg-white/5 border-white/10";
            return (
              <div
                key={o.id}
                className={`${ui.card} overflow-hidden transition-all`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : o.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/[.03] transition"
                >
                  {/* Type badge */}
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${colors} whitespace-nowrap`}>
                    {OVERRIDE_LABELS[o.override_type] ?? o.override_type}
                  </span>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-white truncate">{o.admin_name}</span>
                      <span className={ui.muted2}>→</span>
                      <Link
                        href={`/admin/users/${o.target_user}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-blue-400 hover:underline truncate"
                      >
                        {o.target_name}
                      </Link>
                    </div>
                    <p className={`text-xs ${ui.muted2} mt-0.5 truncate`}>{o.reason}</p>
                  </div>

                  {/* Timestamp */}
                  <span className={`text-xs ${ui.muted2} whitespace-nowrap`}>
                    {new Date(o.created_at).toLocaleString()}
                  </span>

                  {/* Expand arrow */}
                  <span className={`text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-white/5 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-white/50 uppercase mb-1">Before</p>
                        <pre className="text-xs text-white/70 bg-white/5 rounded-lg p-3 overflow-x-auto max-h-48">
                          {JSON.stringify(o.previous_value, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white/50 uppercase mb-1">After</p>
                        <pre className="text-xs text-white/70 bg-white/5 rounded-lg p-3 overflow-x-auto max-h-48">
                          {JSON.stringify(o.new_value, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <span className={ui.muted2}>Admin ID: {o.admin_id.slice(0, 12)}…</span>
                      <span className={ui.muted2}>User ID: {o.target_user.slice(0, 12)}…</span>
                      <Link
                        href={`/admin/users/${o.target_user}`}
                        className="text-blue-400 hover:underline"
                      >
                        View User Profile →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className={`${ui.btnGhost} ${ui.btnSmall} disabled:opacity-30`}
          >
            ← Prev
          </button>
          <span className={`text-sm ${ui.muted}`}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className={`${ui.btnGhost} ${ui.btnSmall} disabled:opacity-30`}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
