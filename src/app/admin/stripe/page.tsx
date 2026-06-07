"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

// ── Types ──────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "info";

type ProcessedEvent = {
  event_id: string;
  event_type: string;
  processed_at: string;
  stripe_account_id: string | null;
  stripe_object_id: string | null;
  affected_user_id: string | null;
  severity: Severity;
};

type FailedEvent = {
  event_id: string;
  event_type: string;
  stripe_account_id: string | null;
  stripe_object_id: string | null;
  affected_user_id: string | null;
  payload: Record<string, unknown> | null;
  status: "failed" | "replay_failed" | "replayed_success";
  failure_count: number;
  retry_count: number;
  first_failed_at: string;
  last_failed_at: string;
  last_error_message: string | null;
  last_replayed_at: string | null;
  resolved_at: string | null;
  severity: Severity;
  user: { display_name: string | null; username: string | null } | null;
};

type Summary = {
  total_processed?: number;
  total_failed: number;
  total_critical: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; badge: string; border: string }> = {
  critical: {
    label: "CRITICAL",
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    border: "border-l-red-500",
  },
  high: {
    label: "HIGH",
    dot: "bg-orange-400",
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    border: "border-l-orange-400",
  },
  info: {
    label: "INFO",
    dot: "bg-white/30",
    badge: "bg-white/8 text-white/50 border-white/15",
    border: "border-l-white/20",
  },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  "transfer.created": "Transfer created",
  "transfer.updated": "Transfer updated",
  "transfer.reversed": "Transfer reversed",
  "payout.paid": "Payout paid",
  "payout.failed": "Payout failed",
  "charge.dispute.created": "Dispute opened",
  "charge.dispute.updated": "Dispute updated",
  "charge.dispute.closed": "Dispute closed",
  "payment_intent.succeeded": "Payment succeeded",
  "payment_intent.payment_failed": "Payment failed",
  "payment_intent.canceled": "Payment canceled",
  "refund.created": "Refund created",
  "charge.refunded": "Charge refunded",
  "account.updated": "Account updated",
  "account.application.deauthorized": "Stripe account disconnected",
  "capability.updated": "Capability updated",
  "person.updated": "Person updated",
  "account.external_account.updated": "Bank account updated",
  "review.opened": "Review opened",
  "review.closed": "Review closed",
  "checkout.session.completed": "Checkout completed",
  "invoice.payment_succeeded": "Invoice paid",
  "invoice.payment_failed": "Invoice payment failed",
  "customer.subscription.deleted": "Subscription cancelled",
  "customer.subscription.updated": "Subscription updated",
};

function label(type: string) {
  return EVENT_TYPE_LABELS[type] ?? type;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function shortId(id: string | null) {
  if (!id) return "—";
  return id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminStripePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  const [tab, setTab] = useState<"processed" | "failed">("processed");
  const [severityFilter, setSeverityFilter] = useState<"" | "critical" | "high" | "info">("");
  const [typeFilter, setTypeFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  const [events, setEvents] = useState<ProcessedEvent[] | FailedEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Replay state
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<{ id: string; success: boolean; error?: string } | null>(null);

  // Detail drawer
  const [selected, setSelected] = useState<FailedEvent | null>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !["owner", "co_owner"].includes(session.role)) {
      router.replace("/admin");
      return;
    }
    setAuthorized(true);
  }, [router]);

  const fetchEvents = useCallback(async (cursor?: string | null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tab });
      if (severityFilter) params.set("severity", severityFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (accountFilter) params.set("account_id", accountFilter);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/admin/stripe-events?${params}`, { headers: getAdminHeaders() });
      if (!res.ok) { setError("Failed to load events"); return; }
      const json = await res.json();

      setEvents((prev) => append ? [...(prev as ProcessedEvent[]), ...(json.events ?? [])] : (json.events ?? []));
      setSummary(json.summary ?? null);
      setHasMore(json.hasMore ?? false);
      setNextCursor(json.nextCursor ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tab, severityFilter, typeFilter, accountFilter]);

  // Reset + fetch when filters or tab change
  useEffect(() => {
    if (!authorized) return;
    void fetchEvents(null, false);
  }, [fetchEvents, authorized]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authorized || !autoRefresh) return;
    intervalRef.current = setInterval(() => void fetchEvents(null, false), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchEvents, authorized, autoRefresh]);

  async function handleReplay(eventId: string) {
    setReplayingId(eventId);
    setReplayResult(null);
    try {
      const res = await fetch("/api/admin/stripe/webhook-failures/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ event_id: eventId }),
      });
      const json = await res.json();
      const result = json.results?.[0];
      setReplayResult({
        id: eventId,
        success: result?.success ?? false,
        error: result?.error,
      });
      // Refresh after replay
      setTimeout(() => void fetchEvents(null, false), 800);
    } catch {
      setReplayResult({ id: eventId, success: false, error: "Network error" });
    } finally {
      setReplayingId(null);
    }
  }

  if (!authorized) return null;

  const failedCount = summary?.total_failed ?? 0;
  const criticalCount = summary?.total_critical ?? 0;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className={ui.h1}>Stripe Activity</h1>
          <p className={`text-sm ${ui.muted2} mt-1`}>
            Live feed of all Stripe webhook events on the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
              autoRefresh
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-white/5 border-white/10 text-white/40"
            }`}
          >
            {autoRefresh ? "● Auto-refresh on" : "○ Auto-refresh off"}
          </button>
          <button
            onClick={() => void fetchEvents(null, false)}
            disabled={loading}
            className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2} uppercase tracking-wider`}>Total Processed</p>
          <p className="text-2xl font-bold text-white mt-1">{summary?.total_processed?.toLocaleString() ?? "—"}</p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2} uppercase tracking-wider`}>Failed Events</p>
          <p className={`text-2xl font-bold mt-1 ${failedCount > 0 ? "text-orange-400" : "text-white/30"}`}>
            {failedCount}
          </p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2} uppercase tracking-wider`}>Critical Pending</p>
          <p className={`text-2xl font-bold mt-1 ${criticalCount > 0 ? "text-red-400" : "text-white/30"}`}>
            {criticalCount}
          </p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2} uppercase tracking-wider`}>Webhook Health</p>
          <p className={`text-sm font-semibold mt-1 ${failedCount === 0 ? "text-emerald-400" : criticalCount > 0 ? "text-red-400" : "text-orange-400"}`}>
            {failedCount === 0 ? "Healthy" : criticalCount > 0 ? "Critical issues" : "Degraded"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
        {(["processed", "failed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setNextCursor(null); }}
            className={`px-4 py-1.5 text-sm rounded-lg transition font-medium ${
              tab === t
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {t === "processed" ? "Event Feed" : (
              <span className="flex items-center gap-1.5">
                Failed
                {failedCount > 0 && (
                  <span className="bg-red-500/30 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {failedCount}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/20 transition"
        >
          <option value="">All severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="info">Info</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/20 transition"
        >
          <option value="">All event types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by account ID…"
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/20 transition w-52"
        />
        {(severityFilter || typeFilter || accountFilter) && (
          <button
            onClick={() => { setSeverityFilter(""); setTypeFilter(""); setAccountFilter(""); }}
            className="text-xs text-white/40 hover:text-white/70 px-2 py-1 transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Replay result toast */}
      {replayResult && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
          replayResult.success
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          <span>{replayResult.success ? "✓ Replay succeeded" : "✗ Replay failed"}</span>
          {replayResult.error && <span className="text-xs opacity-70">{replayResult.error}</span>}
          <button onClick={() => setReplayResult(null)} className="ml-auto text-white/30 hover:text-white/60">✕</button>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Event list */}
      <div className={`${ui.card} divide-y divide-white/[0.06] overflow-hidden`}>
        {loading && events.length === 0 ? (
          <div className="py-16 text-center">
            <p className={`text-sm ${ui.muted2}`}>Loading events…</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center">
            <p className={`text-sm ${ui.muted2}`}>No events found</p>
          </div>
        ) : (
          <>
            {tab === "processed"
              ? (events as ProcessedEvent[]).map((e) => {
                  const sev = SEVERITY_CONFIG[e.severity];
                  return (
                    <div
                      key={e.event_id}
                      className={`flex items-start gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition border-l-2 ${sev.border}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${sev.badge}`}>
                            {sev.label}
                          </span>
                          <span className="text-sm text-white font-medium">{label(e.event_type)}</span>
                          <span className="text-xs text-white/30 font-mono">{e.event_type}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/40">
                          {e.stripe_object_id && (
                            <span>ID: <span className="font-mono text-white/60">{shortId(e.stripe_object_id)}</span></span>
                          )}
                          {e.stripe_account_id && (
                            <span>Acct: <span className="font-mono text-white/60">{shortId(e.stripe_account_id)}</span></span>
                          )}
                          <span>{timeAgo(e.processed_at)}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-emerald-400/70 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                        Processed
                      </span>
                    </div>
                  );
                })
              : (events as FailedEvent[]).map((e) => {
                  const sev = SEVERITY_CONFIG[e.severity];
                  const isReplaying = replayingId === e.event_id;
                  const statusColor =
                    e.status === "replayed_success"
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      : e.status === "replay_failed"
                        ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
                        : "text-red-400 bg-red-500/10 border-red-500/20";

                  return (
                    <div
                      key={e.event_id}
                      className={`flex items-start gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition border-l-2 ${sev.border}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${sev.badge}`}>
                            {sev.label}
                          </span>
                          <span className="text-sm text-white font-medium">{label(e.event_type)}</span>
                          <span className="text-xs text-white/30 font-mono">{e.event_type}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/40">
                          {e.stripe_object_id && (
                            <span>ID: <span className="font-mono text-white/60">{shortId(e.stripe_object_id)}</span></span>
                          )}
                          {e.stripe_account_id && (
                            <span>Acct: <span className="font-mono text-white/60">{shortId(e.stripe_account_id)}</span></span>
                          )}
                          {e.user && (
                            <span>User: <span className="text-white/60">{e.user.display_name ?? e.user.username ?? "—"}</span></span>
                          )}
                          <span>Failed {timeAgo(e.last_failed_at)}</span>
                          <span>{e.failure_count}× failures</span>
                        </div>
                        {e.last_error_message && (
                          <p className="mt-1.5 text-xs text-red-400/70 font-mono truncate max-w-lg">
                            {e.last_error_message}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md border capitalize ${statusColor}`}>
                          {e.status.replace(/_/g, " ")}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setSelected(e)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition"
                          >
                            Details
                          </button>
                          {e.status !== "replayed_success" && (
                            <button
                              onClick={() => handleReplay(e.event_id)}
                              disabled={isReplaying}
                              className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition disabled:opacity-40"
                            >
                              {isReplaying ? "Replaying…" : "Replay"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
          </>
        )}
        {hasMore && (
          <div className="px-4 py-4 text-center">
            <button
              onClick={() => void fetchEvents(nextCursor, true)}
              disabled={loadingMore}
              className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      {/* Detail drawer — failed event payload */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`${ui.card} w-full max-w-2xl max-h-[80vh] flex flex-col`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-sm font-semibold text-white">{label(selected.event_type)}</h2>
                <p className="text-xs text-white/40 font-mono mt-0.5">{selected.event_id}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/40 hover:text-white/80 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ["Event type", selected.event_type],
                  ["Status", selected.status.replace(/_/g, " ")],
                  ["Stripe account", selected.stripe_account_id ?? "—"],
                  ["Object ID", selected.stripe_object_id ?? "—"],
                  ["Failures", String(selected.failure_count)],
                  ["Replays", String(selected.retry_count)],
                  ["First failed", selected.first_failed_at ? new Date(selected.first_failed_at).toLocaleString() : "—"],
                  ["Last failed", selected.last_failed_at ? new Date(selected.last_failed_at).toLocaleString() : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white/5 rounded-lg p-2.5">
                    <p className="text-white/40 uppercase tracking-wider text-[10px]">{k}</p>
                    <p className="text-white/80 font-mono mt-0.5 break-all">{v}</p>
                  </div>
                ))}
              </div>
              {selected.last_error_message && (
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1.5">Error</p>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300 font-mono whitespace-pre-wrap break-all">
                    {selected.last_error_message}
                  </div>
                </div>
              )}
              {selected.payload && (
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1.5">Payload</p>
                  <pre className="bg-black/40 border border-white/10 rounded-lg p-3 text-[11px] text-white/60 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              {selected.status !== "replayed_success" ? (
                <button
                  onClick={() => { handleReplay(selected.event_id); setSelected(null); }}
                  disabled={replayingId === selected.event_id}
                  className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-sm px-4 py-2 rounded-xl transition disabled:opacity-40"
                >
                  Replay this event
                </button>
              ) : (
                <span className="text-xs text-emerald-400/70">Already replayed successfully</span>
              )}
              <button onClick={() => setSelected(null)} className={`${ui.btnGhost} ${ui.btnSmall} text-xs`}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
