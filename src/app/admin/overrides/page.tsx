"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAdminSession, getAdminHeaders } from "@/lib/auth/adminSession";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";

type LinkedDispute = {
  receipt_id: string;
  tip_amount: number;
  refunded_amount: number;
  refund_status: string;
  status: string;
  created_at: string;
};

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
  disputes: LinkedDispute[];
  dispute_count: number;
  refund_count: number;
};

type RealtimeOverrideRow = {
  id: string;
  admin_id: string;
  target_user: string;
  override_type: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string;
  created_at: string;
  is_archived?: boolean;
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

const RISK_BAR_COLORS: Record<string, string> = {
  override_withdrawal_limit: "bg-red-400",
  manual_flag: "bg-orange-400",
  unlock_withdrawal: "bg-amber-400",
  bypass_verification: "bg-amber-400",
  unflag: "bg-green-400",
  clear_restriction: "bg-green-400",
  override_risk_score: "bg-blue-400",
};

const PAGE_SIZE = 25;

function getFraudPattern(o: Override): string | null {
  const { dispute_count, refund_count, override_type } = o;
  if (dispute_count >= 3) return "serial_disputes";
  if (dispute_count >= 2) return "repeat_disputes";
  if (override_type === "unflag" && dispute_count >= 1) return "unflag_with_disputes";
  if (override_type === "clear_restriction" && dispute_count >= 1) return "cleared_with_disputes";
  if (override_type === "override_withdrawal_limit" && refund_count >= 2) return "withdrawal_override_refund_history";
  if (dispute_count === 1 && refund_count >= 1) return "refund_after_dispute";
  return null;
}

const FRAUD_PATTERN_MESSAGES: Record<string, string> = {
  serial_disputes: "User has 3+ disputes — potential systematic abuse pattern.",
  repeat_disputes: "Multiple disputes linked to this user. Investigate before approving overrides.",
  unflag_with_disputes: "User was unflagged despite active disputes — review for premature clearance.",
  cleared_with_disputes: "Restriction cleared while disputes exist — possible abuse window.",
  withdrawal_override_refund_history: "Withdrawal limit lifted for user with refund history — high risk of fund extraction.",
  refund_after_dispute: "Refund and dispute activity overlap — review for double-dip abuse.",
};

const FIELD_LABELS: Record<string, string> = {
  withdrawal_limit: "Withdrawal Limit",
  risk_score: "Risk Score",
  flagged: "Flagged",
  flag_reason: "Flag Reason",
  restricted: "Restricted",
  restriction_reason: "Restriction Reason",
  verified: "Verified",
  verification_status: "Verification Status",
  status: "Status",
  locked: "Locked",
  balance: "Balance",
  role: "Role",
};

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.includes("balance") || key.includes("limit") || key.includes("amount")) {
      return value === 0 ? "$0.00" : `$${value.toFixed(2)}`;
    }
    return String(value);
  }
  if (typeof value === "string") return value || "—";
  return JSON.stringify(value);
}

/* ── Reusable section wrapper ── */
function Section({ title, accent, children }: { title: string; accent?: string; children: ReactNode }) {
  return (
    <div className={`p-4 rounded-xl bg-white/[.02] border ${accent ?? "border-white/10"}`}>
      <p className="text-[10px] font-semibold tracking-widest text-white/40 uppercase mb-3">{title}</p>
      {children}
    </div>
  );
}

function DiffView({ previous, next }: { previous: Record<string, unknown>; next: Record<string, unknown> }) {
  const allKeys = [...new Set([...Object.keys(previous), ...Object.keys(next)])];
  if (allKeys.length === 0) return <p className="text-xs text-white/30">No data recorded</p>;

  return (
    <div className="space-y-1.5">
      {allKeys.map((key) => {
        const prev = previous[key];
        const curr = next[key];
        const changed = key in next && JSON.stringify(prev) !== JSON.stringify(curr);
        const label = FIELD_LABELS[key] ?? key.replace(/_/g, " ");
        return (
          <div
            key={key}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
              changed ? "bg-white/[.04] border border-white/[.08]" : ""
            }`}
          >
            <span className="text-white/35 font-medium w-36 shrink-0 capitalize">{label}</span>
            <span className={`font-mono ${changed ? "text-red-400/80 line-through" : "text-white/40"}`}>
              {formatFieldValue(key, prev)}
            </span>
            {changed && (
              <>
                <span className="text-white/15">→</span>
                <span className="font-mono text-green-400 font-semibold">
                  {formatFieldValue(key, curr)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OverridesPage() {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [isLive, setIsLive] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [overrideModal, setOverrideModal] = useState<{ type: string; label: string; userId: string; userName: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState("");
  const [adminRole, setAdminRole] = useState("");

  async function submitOverride() {
    if (!overrideModal || overrideReason.trim().length < 5) return;
    setOverrideSubmitting(true);
    setOverrideMessage("");
    try {
      const headers = getAdminHeaders();
      const res = await fetch("/api/admin/override", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: overrideModal.userId,
          overrideType: overrideModal.type,
          reason: overrideReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Override failed");
      setOverrideMessage(`Override applied: ${overrideModal.label} for ${overrideModal.userName}`);
      setOverrideModal(null);
      setOverrideReason("");
      fetchOverrides({ reset: true });
      setTimeout(() => setOverrideMessage(""), 5000);
    } catch (err: unknown) {
      setOverrideMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setOverrideSubmitting(false);
    }
  }

  useEffect(() => {
    const session = getAdminSession();
    if (!session) { router.replace("/admin/login"); return; }
    const allowed = ["owner", "super_admin", "finance_admin"];
    if (!allowed.includes(session.role)) { router.replace("/admin"); return; }
    setAdminRole(session.role);
    fetchOverrides({ reset: true });
     
  }, [router, typeFilter, viewMode]);

  useEffect(() => {
    if (viewMode !== "active") {
      setIsLive(false);
      return;
    }

    const channel = supabase
      .channel("admin-overrides-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_overrides",
        },
        (payload) => {
          const incoming = payload.new as RealtimeOverrideRow;
          if (incoming.is_archived) return;
          if (typeFilter && incoming.override_type !== typeFilter) return;

          const liveOverride: Override = {
            id: incoming.id,
            admin_id: incoming.admin_id,
            admin_name: incoming.admin_id,
            target_user: incoming.target_user,
            target_name: incoming.target_user,
            override_type: incoming.override_type,
            previous_value: incoming.previous_value ?? {},
            new_value: incoming.new_value ?? {},
            reason: incoming.reason,
            created_at: incoming.created_at,
            disputes: [],
            dispute_count: 0,
            refund_count: 0,
          };

          setOverrides((prev) => {
            if (prev.some((item) => item.id === liveOverride.id)) return prev;
            return [liveOverride, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "admin_overrides",
        },
        (payload) => {
          const updated = payload.new as RealtimeOverrideRow;

          setOverrides((prev) => {
            const next = prev.filter((item) => item.id !== updated.id);

            if (updated.is_archived) return next;
            if (typeFilter && updated.override_type !== typeFilter) return next;

            const existing = prev.find((item) => item.id === updated.id);
            if (!existing) return prev;

            const merged: Override = {
              ...existing,
              override_type: updated.override_type,
              previous_value: updated.previous_value ?? existing.previous_value,
              new_value: updated.new_value ?? existing.new_value,
              reason: updated.reason,
              created_at: updated.created_at,
            };

            return [merged, ...next];
          });
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      setIsLive(false);
      supabase.removeChannel(channel);
    };
  }, [typeFilter, viewMode]);

  async function fetchOverrides({ reset, cursor }: { reset?: boolean; cursor?: string | null } = {}) {
    const isReset = reset ?? false;
    if (isReset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (typeFilter) params.set("type", typeFilter);
    if (!isReset && cursor) params.set("cursor", cursor);
    if (viewMode === "archived") params.set("archived", "true");

    try {
      const res = await fetch(`/api/admin/overrides?${params}`, { headers });
      if (!res.ok) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const json = await res.json();
      const rows = json.data ?? [];
      setOverrides((current) => (isReset ? rows : [...current, ...rows]));
      setCursor(json.next_cursor ?? null);
    } catch {
      // Network error — keep previous data
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Override Control</h1>
          <p className="text-sm text-white/40 mt-1">
            Financial audit trail · <span className="text-white/60 font-medium">{overrides.length}</span> {viewMode} overrides loaded
          </p>
          <p className="text-xs text-white/30 mt-1">
            Active feed keeps recent override activity fast. Archived history contains overrides aged out after the 60-day retention window.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {viewMode === "active" && (
            <div className={`text-xs font-semibold flex items-center gap-1.5 ${isLive ? "text-green-400" : "text-amber-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-400" : "bg-amber-400"}`} />
              {isLive ? "Live" : "Connecting..."}
            </div>
          )}

          <div className="inline-flex rounded-xl border border-white/10 bg-white/[.03] p-1">
            <button
              onClick={() => { setViewMode("active"); setExpanded(null); }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                viewMode === "active" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => { setViewMode("archived"); setExpanded(null); }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                viewMode === "archived" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
              }`}
            >
              Archived
            </button>
          </div>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setExpanded(null); }}
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
      </div>

      <div className={`${ui.card} p-4 border-white/10`}>
        <p className="text-xs font-semibold tracking-widest text-white/35 uppercase">
          {viewMode === "active" ? "Hot Feed" : "Historical Archive"}
        </p>
        <p className="text-sm text-white/55 mt-2 leading-relaxed">
          {viewMode === "active"
            ? "This view only shows non-archived overrides so the main feed stays small, indexed, and fast under load."
            : "This view reads from the archive store. Use it for older investigations, not for day-to-day operational review."}
        </p>
      </div>

      {/* ── FEEDBACK TOAST (success only — errors show inside the modal) ── */}
      {overrideMessage && !overrideMessage.startsWith("Error") && (
        <div className="text-sm px-4 py-3 rounded-xl font-medium transition-all bg-green-500/10 text-green-400 border border-green-500/20">
          {overrideMessage}
        </div>
      )}

      {/* ── OVERRIDE LIST ── */}
      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <p className="text-sm text-white/40 mt-3">Loading audit trail…</p>
        </div>
      ) : overrides.length === 0 ? (
        <div className={`${ui.card} p-12 text-center`}>
          <p className="text-white/30 text-sm">No overrides found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {overrides.map((o) => {
            const isExpanded = expanded === o.id;
            const colors = SEVERITY_COLORS[o.override_type] ?? "text-white/70 bg-white/5 border-white/10";
            const riskBar = RISK_BAR_COLORS[o.override_type] ?? "bg-white/20";
            const fraudPattern = getFraudPattern(o);

            return (
              <div
                key={o.id}
                className={`${ui.card} overflow-hidden transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] ${
                  fraudPattern ? "ring-1 ring-orange-500/25" : ""
                } ${isExpanded ? "shadow-[0_0_30px_rgba(0,0,0,0.4)]" : ""}`}
              >
                {/* ── COLLAPSED ROW ── */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpanded(isExpanded ? null : o.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(isExpanded ? null : o.id); } }}
                  className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-white/[.02] transition-colors cursor-pointer"
                >
                  {/* LEFT RISK BAR */}
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${
                    fraudPattern ? "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.3)]" : riskBar + " opacity-40"
                  }`} />

                  {/* MAIN CONTENT */}
                  <div className="flex-1 min-w-0">
                    {/* Top line — badge + risk */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${colors}`}>
                        {OVERRIDE_LABELS[o.override_type] ?? o.override_type}
                      </span>
                      {fraudPattern && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-400/20 animate-pulse tracking-wider">
                          RISK
                        </span>
                      )}
                    </div>

                    {/* Admin → User */}
                    <div className="mt-1.5 flex items-center gap-2 text-sm">
                      <span className="font-semibold text-white">{o.admin_name}</span>
                      <span className="text-white/20">→</span>
                      <Link
                        href={`/admin/users/${o.target_user}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-400 hover:text-blue-300 hover:underline font-semibold transition-colors"
                      >
                        {o.target_name}
                      </Link>
                    </div>

                    {/* Reason (single line) */}
                    <p className="text-xs text-white/30 mt-1 line-clamp-1">{o.reason}</p>
                  </div>

                  {/* RIGHT SIDE — stats + timestamp */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[11px] text-white/30 tabular-nums">
                      {new Date(o.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" "}
                      <span className="text-white/50">{new Date(o.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <div className="flex gap-1.5">
                      {o.dispute_count > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 tabular-nums">
                          {o.dispute_count}D
                        </span>
                      )}
                      {o.refund_count > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 tabular-nums">
                          {o.refund_count}R
                        </span>
                      )}
                    </div>
                  </div>

                  {/* CHEVRON */}
                  <span className={`text-white/20 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </div>

                {/* ── EXPANDED DETAIL ── */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-4 border-t border-white/[.06] space-y-3">

                    {/* Timeline marker */}
                    <div className="flex items-center gap-3 text-[11px] text-white/30 pb-1">
                      <div className="w-2 h-2 rounded-full bg-white/20" />
                      <span>Override applied</span>
                      <span className="text-white/15">·</span>
                      <span>{new Date(o.created_at).toLocaleString()}</span>
                      <span className="text-white/15">·</span>
                      <span>by {o.admin_name}</span>
                    </div>

                    {/* Changes */}
                    <Section title="Changes">
                      <DiffView previous={o.previous_value} next={o.new_value} />
                    </Section>

                    {/* Linked Disputes */}
                    {o.disputes.length > 0 && (
                      <Section title={`Linked Disputes (${o.disputes.length})`} accent="border-red-400/15">
                        <div className="space-y-2">
                          {o.disputes.map((d) => (
                            <div key={d.receipt_id} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/[.06]">
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-semibold text-white tabular-nums">
                                  ${Number(d.tip_amount).toFixed(2)}
                                </p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                                  DISPUTED
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-[11px] text-white/30 tabular-nums">
                                  {d.receipt_id.slice(0, 8)}…
                                </span>
                                <Link
                                  href={`/admin/disputes?highlight=${d.receipt_id}`}
                                  className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                                >
                                  View →
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                        {o.dispute_count > o.disputes.length && (
                          <p className="text-[11px] text-red-400/70 mt-2">
                            + {o.dispute_count - o.disputes.length} more disputes across all tips
                          </p>
                        )}
                      </Section>
                    )}

                    {/* Risk Analysis */}
                    {fraudPattern && (
                      <Section title="Risk Analysis" accent="border-orange-400/20">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
                            <span className="text-orange-400 text-sm">⚠</span>
                          </div>
                          <div>
                            <p className="text-xs text-orange-400 font-semibold">{fraudPattern.replace(/_/g, " ").toUpperCase()}</p>
                            <p className="text-xs text-white/50 mt-1 leading-relaxed">
                              {FRAUD_PATTERN_MESSAGES[fraudPattern]}
                            </p>
                          </div>
                        </div>
                      </Section>
                    )}

                    {/* Cross-Case History + Quick Actions — side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Cross-Case */}
                      <Section title="Cross-Case History">
                        <div className="flex gap-8">
                          <div>
                            <p className="text-xs text-white/30">Disputes</p>
                            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${o.dispute_count > 0 ? "text-red-400" : "text-white/15"}`}>
                              {o.dispute_count}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-white/30">Refunds</p>
                            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${o.refund_count > 0 ? "text-amber-400" : "text-white/15"}`}>
                              {o.refund_count}
                            </p>
                          </div>
                        </div>
                      </Section>

                      {/* Quick Actions */}
                      <Section title="Quick Actions">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => setOverrideModal({ type: "unflag", label: "Unflag User", userId: o.target_user, userName: o.target_name })}
                            className="bg-green-500/10 text-green-400 border border-green-400/20 rounded-lg py-2 text-[11px] font-semibold hover:bg-green-500/20 transition-colors"
                          >
                            Unflag
                          </button>
                          <button
                            onClick={() => setOverrideModal({ type: "manual_flag", label: "Manual Flag", userId: o.target_user, userName: o.target_name })}
                            className="bg-orange-500/10 text-orange-400 border border-orange-400/20 rounded-lg py-2 text-[11px] font-semibold hover:bg-orange-500/20 transition-colors"
                          >
                            Flag User
                          </button>
                          <button
                            onClick={() => setOverrideModal({ type: "clear_restriction", label: "Clear Restriction", userId: o.target_user, userName: o.target_name })}
                            className="bg-green-500/10 text-green-400 border border-green-400/20 rounded-lg py-2 text-[11px] font-semibold hover:bg-green-500/20 transition-colors"
                          >
                            Clear Restriction
                          </button>
                          <button
                            onClick={() => setOverrideModal({ type: "bypass_verification", label: "Bypass Verification", userId: o.target_user, userName: o.target_name })}
                            className="bg-amber-500/10 text-amber-400 border border-amber-400/20 rounded-lg py-2 text-[11px] font-semibold hover:bg-amber-500/20 transition-colors"
                          >
                            Bypass Verification
                          </button>
                          <button
                            onClick={() => setOverrideModal({ type: "override_risk_score", label: "Reset Risk Score", userId: o.target_user, userName: o.target_name })}
                            className="bg-blue-500/10 text-blue-400 border border-blue-400/20 rounded-lg py-2 text-[11px] font-semibold hover:bg-blue-500/20 transition-colors"
                          >
                            Reset Risk
                          </button>
                          <button
                            onClick={() => setOverrideModal({ type: "unlock_withdrawal", label: "Unlock Withdrawal", userId: o.target_user, userName: o.target_name })}
                            className="bg-amber-500/10 text-amber-400 border border-amber-400/20 rounded-lg py-2 text-[11px] font-semibold hover:bg-amber-500/20 transition-colors"
                          >
                            Unlock Withdrawal
                          </button>
                          {adminRole === "owner" && (
                            <button
                              onClick={() => setOverrideModal({ type: "override_withdrawal_limit", label: "Remove Withdrawal Limit", userId: o.target_user, userName: o.target_name })}
                              className="col-span-2 bg-red-500/10 text-red-400 border border-red-400/20 rounded-lg py-2 text-[11px] font-bold hover:bg-red-500/20 transition-colors"
                            >
                              Remove Withdrawal Limit
                            </button>
                          )}
                        </div>
                      </Section>
                    </div>

                    {/* Footer links */}
                    <div className="flex items-center gap-3 pt-1 flex-wrap">
                      <span className="text-[10px] text-white/20 font-mono">{o.admin_id.slice(0, 12)}…</span>
                      <span className="text-white/10">|</span>
                      <Link href={`/admin/users/${o.target_user}`} className="text-[11px] text-blue-400/80 hover:text-blue-300 hover:underline transition-colors">
                        User Profile →
                      </Link>
                      {o.dispute_count > 0 && (
                        <>
                          <span className="text-white/10">|</span>
                          <Link href={`/admin/disputes?user=${o.target_user}`} className="text-[11px] text-red-400/80 hover:text-red-300 hover:underline transition-colors">
                            All Disputes →
                          </Link>
                        </>
                      )}
                      {o.refund_count > 0 && (
                        <>
                          <span className="text-white/10">|</span>
                          <Link href="/admin/refunds" className="text-[11px] text-amber-400/80 hover:text-amber-300 hover:underline transition-colors">
                            Refunds →
                          </Link>
                        </>
                      )}
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── LOAD MORE ── */}
      {!loading && cursor && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={() => fetchOverrides({ cursor })}
            disabled={loadingMore}
            className={`${ui.btnGhost} ${ui.btnSmall} disabled:opacity-20`}
          >
            {loadingMore ? "Loading…" : `Load Older ${viewMode === "archived" ? "Archived" : "Active"} Overrides`}
          </button>
        </div>
      )}

      {/* ── OVERRIDE CONFIRMATION MODAL ── */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`${ui.card} p-0 w-full max-w-[460px] overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.6)]`}>

            {/* Modal header bar */}
            <div className="px-6 py-4 border-b border-white/[.06] bg-amber-500/[.03]">
              <p className="text-xs font-bold tracking-widest text-amber-400/70 uppercase">Admin Override</p>
              <h2 className="text-lg font-semibold text-white mt-1">{overrideModal.label}</h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-white/50 leading-relaxed">
                Apply override to <span className="text-white font-semibold">{overrideModal.userName}</span>.
                This action is logged permanently and visible in the audit trail.
              </p>

              {overrideMessage.startsWith("Error") && (
                <div className="text-xs px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                  {overrideMessage}
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Reason</label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Why is this override necessary? (min 5 chars)"
                  rows={3}
                  className={`${ui.input} !py-3 !text-sm resize-none mt-2`}
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Link
                  href={`/admin/users/${overrideModal.userId}`}
                  className="text-[11px] text-blue-400/70 hover:text-blue-300 hover:underline transition-colors"
                >
                  Open user profile instead →
                </Link>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setOverrideModal(null); setOverrideReason(""); setOverrideMessage(""); }}
                    className={`${ui.btnGhost} ${ui.btnSmall}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitOverride}
                    disabled={overrideSubmitting || overrideReason.trim().length < 5}
                    className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    {overrideSubmitting ? "Applying…" : "Apply Override"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
