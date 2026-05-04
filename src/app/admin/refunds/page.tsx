"use client";

import { useEffect, useRef, useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import { REFUND_REASON_LABELS, REFUND_REASONS, type RefundReason } from "@/lib/refundReasons";
import Link from "next/link";

type RefundTip = {
  receipt_id: string;
  creator_user_id: string;
  tip_amount: number;
  refunded_amount: number;
  refund_status: string;
  refund_initiated_at: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  created_at: string;
};

type ConfirmState = {
  tipId: string;
  refundAmount: number;
  creatorBalance: number;
  newBalance: number;
} | null;

type TimelineEvent = {
  type: string;
  title: string;
  detail: string | null;
  actor: string | null;
  severity: string;
  created_at: string;
};

type RiskAlert = {
  id: string;
  type: string;
  message: string;
  severity: string;
  resolved: boolean;
  created_at: string;
};

type LinkedDispute = {
  receipt_id: string;
  tip_amount: number;
  refunded_amount: number;
  refund_status: string;
  status: string;
  created_at: string;
  stripe_payment_intent_id: string | null;
};

type RefundDetail = {
  tip: RefundTip;
  creator: { handle: string | null; display_name: string | null } | null;
  balance: number;
  timeline: TimelineEvent[];
  actorMap: Record<string, string>;
  riskAlerts: RiskAlert[];
  creatorDisputes: LinkedDispute[];
  creatorDisputeCount: number;
  thisIpDisputed: boolean;
};

export default function AdminRefundsPage() {
  const [tips, setTips] = useState<RefundTip[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, RefundDetail>>({});

  // Reason/note for refund initiation
  const [refundReason, setRefundReason] = useState<RefundReason>("user_request");
  const [refundNote, setRefundNote] = useState("");
  const [reasonModalTip, setReasonModalTip] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showMessage(msg: string) {
    setMessage(msg);
    clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setMessage(null), 5000);
  }

  useEffect(() => {
    fetchRefunds();
  }, [filter]);

  async function fetchRefunds() {
    setLoading(true);
    setFetchError(false);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setLoading(false); return; }

    try {
      const url = filter === "all"
        ? "/api/admin/refund"
        : `/api/admin/refund?status=${encodeURIComponent(filter)}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setTips(data.tips ?? []);
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    }
    setLoading(false);
  }

  function openRefundModal(tipId: string) {
    setReasonModalTip(tipId);
    setRefundReason("user_request");
    setRefundNote("");
  }

  async function initiateRefund() {
    const tipId = reasonModalTip;
    if (!tipId) return;
    setReasonModalTip(null);
    setActing(tipId);
    setMessage(null);

    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setActing(null); return; }

    // Risk check: fetch creator balance via API
    const tip = tips.find((t) => t.receipt_id === tipId);
    if (tip) {
      const remaining = Number(tip.tip_amount) - Number(tip.refunded_amount ?? 0);
      try {
        const balRes = await fetch(
          `/api/admin/refund/balance?user_id=${encodeURIComponent(tip.creator_user_id)}`,
          { headers }
        );
        if (balRes.ok) {
          const { balance } = await balRes.json();
          if (remaining > balance) {
            setConfirmModal({
              tipId,
              refundAmount: remaining,
              creatorBalance: balance,
              newBalance: balance - remaining,
            });
            return; // Wait for modal confirmation
          }
        }
      } catch {
        // If balance check fails, proceed with refund (API has its own guards)
      }
    }

    await executeRefund(tipId);
  }

  async function executeRefund(tipId: string) {
    setActing(tipId);
    setConfirmModal(null);

    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setActing(null); return; }

    try {
      const res = await fetch("/api/admin/refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          tip_intent_id: tipId,
          reason: refundReason,
          note: refundNote.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (res.ok) {
        if (json.pending_approval) {
          showMessage(json.message);
        } else {
          showMessage(`Refund initiated: ${json.refund_id} ($${json.amount})`);
        }
      } else {
        showMessage(`Error: ${json.error}`);
      }
    } catch {
      showMessage("Error: Network request failed");
    } finally {
      setActing(null);
      fetchRefunds();
    }
  }

  async function retryRefund(tipId: string) {
    setActing(tipId);
    setMessage(null);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setActing(null); return; }

    try {
      const res = await fetch("/api/admin/refund/retry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ tip_intent_id: tipId }),
      });

      const json = await res.json();
      showMessage(
        res.ok
          ? `Retry succeeded: ${json.refund_id} ($${json.amount})`
          : `Error: ${json.error}`
      );
    } catch {
      showMessage("Error: Network request failed");
    } finally {
      setActing(null);
      fetchRefunds();
    }
  }

  function isStale(tip: RefundTip) {
    if (tip.refund_status !== "initiated" || !tip.refund_initiated_at) return false;
    return Date.now() - new Date(tip.refund_initiated_at).getTime() > 10 * 60 * 1000;
  }

  async function fetchDetail(tipId: string) {
    setDetailLoading(tipId);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setDetailLoading(null); return; }
    try {
      const res = await fetch(
        `/api/admin/refund/detail?tip_id=${encodeURIComponent(tipId)}`,
        { headers },
      );
      if (res.ok) {
        const data: RefundDetail = await res.json();
        setDetailCache((c) => ({ ...c, [tipId]: data }));
      }
    } catch {
      // silent — error state handled by missing cache entry
    }
    setDetailLoading((prev) => (prev === tipId ? null : prev));
  }

  async function toggleCard(tipId: string) {
    if (activeId === tipId) {
      setActiveId(null);
      return;
    }
    setActiveId(tipId);

    if (!detailCache[tipId]) {
      fetchDetail(tipId);
    }
  }

  function generateRiskText(t: RefundTip) {
    const remaining = Number(t.tip_amount) - Number(t.refunded_amount ?? 0);
    if (remaining > 100) return "High-value refund remaining. Review for potential abuse.";
    if (t.refund_status === "initiated") return "Refund pending processing. Monitor for stale state.";
    if (t.refund_status === "full") return "Fully refunded. No action needed.";
    return "No immediate risk signals.";
  }

  function actorLabel(actorId: string | null, actorMap: Record<string, string>) {
    if (!actorId) return null;
    const handle = actorMap[actorId];
    return handle ? `@${handle}` : `${actorId.slice(0, 6)}…`;
  }

  function timelineDotColor(severity: string) {
    switch (severity) {
      case "critical": case "danger": return "bg-red-400";
      case "warning": return "bg-orange-400";
      default: return "bg-blue-400";
    }
  }

  function getFraudPattern(t: RefundTip, detail: RefundDetail | undefined) {
    if (!detail) return null;
    const disputeCount = detail.creatorDisputeCount;
    if (disputeCount >= 2) return "repeat_disputes";
    if (disputeCount === 1 && t.refund_status === "full") return "refund_after_dispute";
    if (detail.thisIpDisputed) return "this_disputed";
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={ui.h1}>Refunds</h1>
          <p className={`text-sm ${ui.muted} mt-1`}>Manage and review refund activity</p>
        </div>
        <div className="text-xs text-gray-400">
          {tips.length} records
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div className={`${ui.card} p-3 text-sm ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
          {message}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2}`}>Initiated</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">
            {tips.filter((t) => t.refund_status === "initiated").length}
          </p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2}`}>Partial</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {tips.filter((t) => t.refund_status === "partial").length}
          </p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2}`}>Completed</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {tips.filter((t) => t.refund_status === "full").length}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${ui.select} max-w-[200px]`}
        >
          <option value="all" className="bg-zinc-900 text-white">All refund statuses</option>
          <option value="initiated" className="bg-zinc-900 text-orange-400">Initiated</option>
          <option value="partial" className="bg-zinc-900 text-yellow-400">Partial</option>
          <option value="full" className="bg-zinc-900 text-green-400">Full</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : fetchError ? (
        <div className={`${ui.card} p-6 text-center`}>
          <p className="text-red-400">Failed to load refunds</p>
          <button onClick={fetchRefunds} className="text-sm text-blue-400 hover:underline mt-2">Retry</button>
        </div>
      ) : tips.length === 0 ? (
        <div className={`${ui.card} p-6 text-center`}>
          <p className={ui.muted}>No refunds found.</p>
          <p className={`text-sm ${ui.muted2} mt-1`}>Tips with refund activity will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tips.map((t) => {
            const remaining = Number(t.tip_amount) - Number(t.refunded_amount ?? 0);
            const refundedPct = Number(t.tip_amount) > 0
              ? (Number(t.refunded_amount ?? 0) / Number(t.tip_amount)) * 100
              : 0;
            const isActive = activeId === t.receipt_id;

            return (
              <div
                key={t.receipt_id}
                onClick={() => toggleCard(t.receipt_id)}
                className={`${ui.card} p-5 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-xl animate-card-enter ${
                  isActive ? "ring-1 ring-blue-500/40" : ""
                }`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-lg font-semibold text-white">
                        ${Number(t.tip_amount).toFixed(2)}
                      </span>
                      <span className={`text-xs ${ui.muted2}`}>
                        {t.receipt_id.slice(0, 6)}…
                      </span>
                      <span className={`text-xs ${ui.muted2}`}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                      {isStale(t) && (
                        <span className="text-xs font-semibold text-red-400 animate-pulse">⚠ Stale (&gt;10m)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {remaining > 100 && (
                      <span className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 px-2 py-1 rounded-md">
                        High value remaining
                      </span>
                    )}
                    {detailCache[t.receipt_id]?.creatorDisputeCount > 0 && (
                      <span className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 px-2 py-1 rounded-full">
                        Linked to disputes
                      </span>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      t.refund_status === "initiated"
                        ? "bg-orange-500/10 text-orange-400 border border-orange-400/20"
                        : t.refund_status === "partial"
                          ? "bg-yellow-500/10 text-yellow-400 border border-yellow-400/20"
                          : t.refund_status === "full"
                            ? "bg-green-500/10 text-green-400 border border-green-400/20"
                            : "bg-white/5 text-white/65 border border-white/10"
                    }`}>
                      {t.refund_status}
                    </span>
                  </div>
                </div>

                {/* Expandable Investigation Panel */}
                {isActive && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-5 animate-[fadeIn_0.25s_ease-out]">

                    {(detailLoading === t.receipt_id) && !detailCache[t.receipt_id] ? (
                      <p className={`text-xs ${ui.muted}`}>Loading investigation data…</p>
                    ) : detailLoading !== t.receipt_id && !detailCache[t.receipt_id] ? (
                      <div className="text-center py-3">
                        <p className="text-xs text-red-400">Failed to load investigation data</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); fetchDetail(t.receipt_id); }}
                          className="text-xs text-blue-400 hover:underline mt-1"
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Who Initiated + Created */}
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <p className={`text-xs ${ui.muted2}`}>Creator</p>
                            <p className="text-blue-400 font-medium">
                              {detailCache[t.receipt_id]?.creator?.handle
                                ? `@${detailCache[t.receipt_id].creator!.handle}`
                                : t.creator_user_id.slice(0, 8) + "…"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs ${ui.muted2}`}>Created</p>
                            <p className="font-medium text-sm">{new Date(t.created_at).toLocaleString()}</p>
                          </div>
                          {detailCache[t.receipt_id] && (
                            <div className="text-right">
                              <p className={`text-xs ${ui.muted2}`}>Balance</p>
                              <p className={`font-semibold text-sm ${detailCache[t.receipt_id].balance < remaining ? "text-red-400" : "text-green-400"}`}>
                                ${detailCache[t.receipt_id].balance.toFixed(2)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Financial Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className={`text-xs ${ui.muted2}`}>Total</p>
                            <p className="font-semibold mt-0.5">${Number(t.tip_amount).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className={`text-xs ${ui.muted2}`}>Refunded</p>
                            <p className="font-semibold text-yellow-400 mt-0.5">
                              ${Number(t.refunded_amount ?? 0).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className={`text-xs ${ui.muted2}`}>Remaining</p>
                            <p className="font-semibold text-green-400 mt-0.5">
                              ${remaining.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className={`text-xs ${ui.muted2}`}>Tip Status</p>
                            <p className="font-semibold mt-0.5">{t.status}</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div>
                          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                            <span>Refund Progress</span>
                            <span className="font-medium">{refundedPct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-green-400 rounded-full transition-all duration-500"
                              style={{ width: `${refundedPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Stripe Trace */}
                        {t.stripe_payment_intent_id && (
                          <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                            <p className="text-xs text-gray-400 font-semibold">Stripe Trace</p>
                            <p className="text-xs font-mono text-green-400 mt-1.5">
                              PI: {t.stripe_payment_intent_id}
                            </p>
                            <p className={`text-xs ${ui.muted2} mt-1`}>
                              Events synced via webhook
                            </p>
                          </div>
                        )}

                        {/* Timeline */}
                        {detailCache[t.receipt_id]?.timeline && detailCache[t.receipt_id].timeline.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 font-semibold mb-3">Timeline</p>
                            <div className="space-y-3 border-l-2 border-white/10 pl-4">
                              {detailCache[t.receipt_id].timeline.map((event, i) => (
                                <div key={i} className="relative">
                                  <span className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-zinc-900 ${timelineDotColor(event.severity)}`} />
                                  <div>
                                    <p className="text-sm font-medium text-white">{event.title}</p>
                                    {event.detail && (
                                      <p className={`text-xs ${ui.muted2} mt-0.5`}>{event.detail}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {event.actor && (
                                        <span className="text-xs text-blue-400">
                                          {actorLabel(event.actor, detailCache[t.receipt_id].actorMap)}
                                        </span>
                                      )}
                                      <span className={`text-xs ${ui.muted2}`}>
                                        {new Date(event.created_at).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Risk Alerts */}
                        {detailCache[t.receipt_id]?.riskAlerts && detailCache[t.receipt_id].riskAlerts.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 font-semibold mb-2">
                              Risk Alerts ({detailCache[t.receipt_id].riskAlerts.filter((a) => !a.resolved).length} unresolved)
                            </p>
                            <div className="space-y-2">
                              {detailCache[t.receipt_id].riskAlerts.map((a) => (
                                <div key={a.id} className={`p-2.5 rounded-lg border text-xs ${
                                  a.severity === "critical"
                                    ? "bg-red-500/5 border-red-500/20 text-red-400"
                                    : a.severity === "warning"
                                      ? "bg-orange-500/5 border-orange-500/20 text-orange-400"
                                      : "bg-blue-500/5 border-blue-500/20 text-blue-400"
                                } ${a.resolved ? "opacity-50" : ""}`}>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="font-medium">{a.type.replace(/_/g, " ")}</span>
                                    {a.resolved && <span className="text-green-400 text-[10px]">Resolved</span>}
                                  </div>
                                  <p>{a.message}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Linked Disputes */}
                        {detailCache[t.receipt_id]?.creatorDisputes && detailCache[t.receipt_id].creatorDisputes.length > 0 && (
                          <div className="p-4 rounded-xl bg-red-500/5 border border-red-400/10">
                            <p className="text-xs font-semibold text-red-400">
                              Linked Disputes ({detailCache[t.receipt_id].creatorDisputes.length})
                            </p>
                            <div className="mt-3 space-y-2">
                              {detailCache[t.receipt_id].creatorDisputes.map((d) => (
                                <div
                                  key={d.receipt_id}
                                  className="p-3 rounded-lg bg-black/30 border border-white/10"
                                >
                                  <div className="flex justify-between items-center">
                                    <p className="text-sm font-medium text-white">
                                      ${Number(d.tip_amount).toFixed(2)}
                                    </p>
                                    <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-400/20">
                                      Disputed
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between mt-1.5">
                                    <p className={`text-xs ${ui.muted2}`}>
                                      {d.receipt_id.slice(0, 6)}… · {new Date(d.created_at).toLocaleString()}
                                    </p>
                                    <Link
                                      href={`/admin/disputes?highlight=${d.receipt_id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-xs text-blue-400 hover:underline"
                                    >
                                      View dispute →
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {detailCache[t.receipt_id].creatorDisputeCount > 2 && (
                              <p className="text-xs text-red-400 mt-3">
                                Creator has {detailCache[t.receipt_id].creatorDisputeCount} total disputes
                              </p>
                            )}
                          </div>
                        )}

                        {/* Fraud Pattern Detection */}
                        {(() => {
                          const pattern = getFraudPattern(t, detailCache[t.receipt_id]);
                          if (!pattern) return null;
                          return (
                            <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-400/20">
                              <p className="text-xs text-orange-400 font-semibold">
                                Fraud Pattern Detected
                              </p>
                              <p className="text-xs text-gray-300 mt-1">
                                {pattern === "repeat_disputes" && "Multiple disputes linked to this creator. Investigate for systematic abuse."}
                                {pattern === "refund_after_dispute" && "Refund issued after dispute — review for double-dip abuse."}
                                {pattern === "this_disputed" && "This tip is currently disputed. Coordinate with dispute resolution."}
                              </p>
                            </div>
                          );
                        })()}

                        {/* Risk Insight */}
                        <div className="p-3 rounded-xl bg-red-500/5 border border-red-400/10">
                          <p className="text-xs text-red-400 font-semibold">Risk Insight</p>
                          <p className="text-xs text-gray-300 mt-1">{generateRiskText(t)}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          {t.refund_status !== "full" && t.refund_status !== "initiated" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openRefundModal(t.receipt_id); }}
                              disabled={acting === t.receipt_id}
                              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-500/10 text-blue-400 border border-blue-400/20 hover:bg-blue-500/20 transition disabled:opacity-40"
                            >
                              {acting === t.receipt_id ? "…" : "Refund Remaining"}
                            </button>
                          )}
                          {isStale(t) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); retryRefund(t.receipt_id); }}
                              disabled={acting === t.receipt_id}
                              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-orange-500/10 text-orange-400 border border-orange-400/20 hover:bg-orange-500/20 transition disabled:opacity-40"
                            >
                              {acting === t.receipt_id ? "…" : "Retry"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reason Selection Modal */}
      {reasonModalTip && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[440px] space-y-4 shadow-[0_0_40px_rgba(0,0,0,0.5)]`}>
            <h2 className="text-lg font-semibold">Refund Reason</h2>
            <p className={`text-xs ${ui.muted2}`}>
              Tip: {reasonModalTip.slice(0, 8)}… · Remaining: $
              {(() => {
                const t = tips.find((t) => t.receipt_id === reasonModalTip);
                return t ? (Number(t.tip_amount) - Number(t.refunded_amount ?? 0)).toFixed(2) : "—";
              })()}
            </p>
            <div>
              <label className={`text-xs ${ui.muted2} block mb-1`}>Reason *</label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value as RefundReason)}
                className={`${ui.select} w-full`}
              >
                {REFUND_REASONS.map((r) => (
                  <option key={r} value={r} className="bg-zinc-900 text-white">
                    {REFUND_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={`text-xs ${ui.muted2} block mb-1`}>Note (optional)</label>
              <textarea
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                placeholder="Additional context for this refund…"
                rows={3}
                className={`${ui.input} !py-2 !text-sm resize-none`}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setReasonModalTip(null)}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                Cancel
              </button>
              <button
                onClick={initiateRefund}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-500 transition`}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[420px] space-y-4`}>
            <h2 className="text-lg font-semibold text-red-400">
              ⚠ This refund will push the account negative
            </h2>
            <div className="space-y-1 text-sm">
              <p>
                <span className={ui.muted2}>Creator balance:</span>{" "}
                <span className="font-semibold">${confirmModal.creatorBalance.toFixed(2)}</span>
              </p>
              <p>
                <span className={ui.muted2}>Refund amount:</span>{" "}
                <span className="font-semibold text-orange-400">${confirmModal.refundAmount.toFixed(2)}</span>
              </p>
              <p>
                <span className={ui.muted2}>New balance:</span>{" "}
                <span className="font-bold text-red-400">${confirmModal.newBalance.toFixed(2)}</span>
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setConfirmModal(null); setActing(null); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                Cancel
              </button>
              <button
                onClick={() => executeRefund(confirmModal.tipId)}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-red-600 hover:bg-red-500 transition`}
              >
                Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
