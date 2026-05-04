"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import { REFUND_REASON_LABELS, type RefundReason } from "@/lib/refundReasons";
import { useToast } from "@/lib/useToast";
import AdminConfirmModal from "@/components/AdminConfirmModal";

type VoteDetail = {
  admin_id: string;
  handle: string | null;
  role: string | null;
};

type RefundRequest = {
  id: string;
  tip_intent_id: string;
  requested_by: string;
  amount: number;
  status: string;
  required_approvals: number;
  requires_owner: boolean;
  reason: string | null;
  note: string | null;
  created_at: string;
  votes: number;
  voteDetails: VoteDetail[];
};

type ProfileInfo = { handle: string | null; display_name: string | null };

type VoteTimelineEntry = {
  admin_id: string;
  handle: string | null;
  role: string | null;
  display_name: string | null;
  voted_at: string;
};

type AuditEntry = {
  id: string;
  admin_id: string;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
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

type RefundDetail = {
  refund: RefundRequest & { locked_at?: string | null; locked_by?: string | null };
  tip: {
    receipt_id: string;
    payment_intent_id: string | null;
    creator_user_id: string;
    supporter_name: string | null;
    tip_amount: number;
    stripe_fee: number | null;
    platform_fee: number | null;
    total_charge: number | null;
    note: string | null;
    message: string | null;
    is_anonymous: boolean;
    status: string;
    needs_refund: boolean;
    failure_reason: string | null;
    refund_status: string;
    refunded_amount: number;
    last_refund_id: string | null;
    refund_initiated_at: string | null;
    created_at: string;
  } | null;
  voteTimeline: VoteTimelineEntry[];
  requester: { handle: string | null; display_name: string | null; role: string | null } | null;
  creator: { handle: string | null; display_name: string | null } | null;
  auditTrail: AuditEntry[];
  riskAlerts: RiskAlert[];
};

export default function AdminApprovalsPage() {
  const [tab, setTab] = useState<"pending" | "completed">("pending");
  const [pending, setPending] = useState<RefundRequest[]>([]);
  const [completed, setCompleted] = useState<RefundRequest[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileInfo>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [needsYouOnly, setNeedsYouOnly] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const { toast, show: showToast } = useToast();

  // Detail panel state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<RefundDetail | null>(null);

  // Dedup: prevent double-processing of realtime events
  const processedEvents = useRef(new Set<string>());
  const MAX_PROCESSED_EVENTS = 500;
  function trackEvent(key: string) {
    if (processedEvents.current.size >= MAX_PROCESSED_EVENTS) {
      const iter = processedEvents.current.values();
      for (let i = 0; i < 100; i++) iter.next();
      const keep = new Set<string>();
      for (const v of iter) keep.add(v);
      processedEvents.current = keep;
    }
    processedEvents.current.add(key);
  }
  // Cache: avoid repeated profile fetches
  const profileCache = useRef(new Map<string, { handle: string | null; role: string | null }>());

  // Modal state
  const [modal, setModal] = useState<{
    refund: RefundRequest;
    action: "approve" | "reject";
  } | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  function highlight(id: string) {
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1500);
  }

  // Helper: fetch voter profile (with cache)
  async function fetchVoterProfile(uid: string): Promise<VoteDetail> {
    const cached = profileCache.current.get(uid);
    if (cached) return { admin_id: uid, handle: cached.handle, role: cached.role };
    const { data } = await supabase
      .from("profiles")
      .select("handle, role")
      .eq("user_id", uid)
      .single();
    const prof = data ?? null;
    if (prof) profileCache.current.set(uid, prof);
    return { admin_id: uid, handle: prof?.handle ?? null, role: prof?.role ?? null };
  }

  // Helper: fetch requester profile and merge into profileMap (with cache)
  function ensureProfileLoaded(userId: string) {
    if (profileCache.current.has(userId)) {
      const c = profileCache.current.get(userId)!;
      setProfileMap((p) =>
        p[userId] ? p : { ...p, [userId]: { handle: c.handle, display_name: null } }
      );
      return;
    }
    supabase
      .from("profiles")
      .select("user_id, handle, display_name")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          profileCache.current.set(userId, { handle: data.handle, role: null });
          setProfileMap((p) => ({
            ...p,
            [data.user_id]: { handle: data.handle, display_name: data.display_name },
          }));
        }
      });
  }

  // Polling fallback — Realtime may be blocked by RLS on anon key
  useEffect(() => {
    const interval = setInterval(() => {
      loadAll(true);
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const session = getAdminSession();
    if (session) setAdminId(session.id);
    loadAll();
  }, []);

  // Realtime subscription — surgical local state patches
  useEffect(() => {
    const channel = supabase
      .channel("approvals-realtime")

      // New refund request → add to pending
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "refund_requests" },
        (payload) => {
          const nr = payload.new as Record<string, unknown>;
          const key = `refund_requests:INSERT:${nr.id}`;
          if (processedEvents.current.has(key)) return;
          trackEvent(key);

          const newRefund: RefundRequest = {
            id: nr.id as string,
            tip_intent_id: nr.tip_intent_id as string,
            requested_by: nr.requested_by as string,
            amount: Number(nr.amount),
            status: nr.status as string,
            required_approvals: Number(nr.required_approvals),
            requires_owner: Boolean(nr.requires_owner),
            reason: (nr.reason as string) ?? null,
            note: (nr.note as string) ?? null,
            created_at: nr.created_at as string,
            votes: 0,
            voteDetails: [],
          };
          if (newRefund.status === "pending") {
            setPending((prev) => {
              if (prev.some((r) => r.id === newRefund.id)) return prev;
              return [newRefund, ...prev];
            });
            ensureProfileLoaded(newRefund.requested_by);
            highlight(newRefund.id);
          }
          setLastUpdate(new Date());
        }
      )

      // New vote → increment vote count + add voter detail
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "refund_approval_votes" },
        (payload) => {
          const vote = payload.new as { id?: string; refund_id: string; admin_id: string };
          const key = `votes:INSERT:${vote.refund_id}:${vote.admin_id}`;
          if (processedEvents.current.has(key)) return;
          trackEvent(key);

          setPending((prev) =>
            prev.map((r) => {
              if (r.id !== vote.refund_id) return r;
              // Vote dedup by admin_id
              if (r.voteDetails.some((v) => v.admin_id === vote.admin_id)) return r;
              return {
                ...r,
                votes: r.votes + 1,
                voteDetails: [
                  ...r.voteDetails,
                  { admin_id: vote.admin_id, handle: null, role: null },
                ],
              };
            })
          );
          // Backfill voter profile (cached)
          fetchVoterProfile(vote.admin_id).then((voterDetail) => {
            setPending((prev) =>
              prev.map((r) => {
                if (r.id !== vote.refund_id) return r;
                return {
                  ...r,
                  voteDetails: r.voteDetails.map((v) =>
                    v.admin_id === vote.admin_id && !v.handle ? voterDetail : v
                  ),
                };
              })
            );
          });
          highlight(vote.refund_id);
          setLastUpdate(new Date());
        }
      )

      // Status update (approved/rejected) → move from pending to completed
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "refund_requests" },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          const id = updated.id as string;
          const status = updated.status as string;
          const key = `refund_requests:UPDATE:${id}:${status}`;
          if (processedEvents.current.has(key)) return;
          trackEvent(key);

          if (status === "approved" || status === "rejected") {
            setPending((prev) => {
              const match = prev.find((r) => r.id === id);
              if (match) {
                const movedItem: RefundRequest = {
                  ...match,
                  status,
                  votes: match.required_approvals,
                };
                setCompleted((c) => {
                  if (c.some((r) => r.id === id)) return c;
                  return [movedItem, ...c];
                });
              }
              return prev.filter((r) => r.id !== id);
            });
          }
          setLastUpdate(new Date());
        }
      )

      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadAll(silent = false) {
    if (!silent) setLoading(true);

    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) {
      if (!silent) setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/approvals", { headers });
      if (!res.ok) {
        if (!silent) setLoading(false);
        return;
      }
      const data = await res.json();

      setPending((data.pending ?? []) as RefundRequest[]);
      setCompleted((data.completed ?? []) as RefundRequest[]);
      setProfileMap(data.profileMap ?? {});
      setLastUpdate(new Date());
    } catch {
      // Silently fail on poll errors
    }

    if (!silent) setLoading(false);
  }

  async function openDetail(refundId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);

    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setDetailLoading(false); return; }

    try {
      const res = await fetch(`/api/admin/approvals/${refundId}`, { headers });
      if (res.ok) {
        const data: RefundDetail = await res.json();
        setDetail(data);
      }
    } catch {
      // fail silently
    }

    setDetailLoading(false);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetail(null);
  }

  // Escape key closes detail panel
  useEffect(() => {
    if (!detailOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDetail();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [detailOpen]);

  function detailLabel(id: string | null | undefined, fallback?: string) {
    if (!id) return fallback ?? "Unknown";
    return id.slice(0, 8) + "…";
  }

  function userLabel(id: string) {
    const p = profileMap[id];
    if (p?.handle) return `@${p.handle}`;
    if (p?.display_name) return p.display_name;
    return `${id.slice(0, 8)}…`;
  }

  async function handleConfirm() {
    if (!modal) return;
    const { refund, action } = modal;
    setActing(true);

    // Snapshot for exact rollback
    const prevPending = pending;

    // Optimistic update — reflect in UI before API responds
    if (action === "approve" && adminId) {
      // Pre-mark this event as processed so realtime doesn't double-apply
      trackEvent(`votes:INSERT:${refund.id}:${adminId}`);
      setPending((prev) =>
        prev.map((r) =>
          r.id === refund.id
            ? {
                ...r,
                votes: r.votes + 1,
                voteDetails: [
                  ...r.voteDetails,
                  { admin_id: adminId, handle: null, role: null },
                ],
              }
            : r
        )
      );
    }
    if (action === "reject") {
      trackEvent(`refund_requests:UPDATE:${refund.id}:rejected`);
    }

    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setActing(false); return; }

    const endpoint =
      action === "approve"
        ? "/api/admin/refund/approve"
        : "/api/admin/refund/reject";

    const body: Record<string, unknown> = { refund_id: refund.id };
    if (action === "reject" && rejectNote.trim()) {
      body.reason = rejectNote.trim();
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });

    setActing(false);
    setModal(null);
    setRejectNote("");

    if (!res.ok) {
      const json = await res.json();
      showToast(json.error ?? "Action failed", "error");
      // Exact rollback to snapshot
      setPending(prevPending);
    } else {
      const json = await res.json();

      if (action === "approve") {
        if (json.executed) {
          showToast("Refund approved and executed", "success");
          // Move to completed immediately (pre-mark realtime dedup)
          trackEvent(`refund_requests:UPDATE:${refund.id}:approved`);
          setPending((prev) => {
            const match = prev.find((r) => r.id === refund.id);
            if (match) {
              setCompleted((c) => {
                if (c.some((r) => r.id === refund.id)) return c;
                return [{ ...match, status: "approved", votes: match.required_approvals }, ...c];
              });
            }
            return prev.filter((r) => r.id !== refund.id);
          });
        } else if (json.needs_owner) {
          showToast(`${json.votes}/${json.required} approvals — owner vote still required`, "info");
        } else {
          showToast(`Approval recorded (${json.votes}/${json.required})`, "success");
        }
      } else {
        showToast("Refund rejected", "success");
      }

      // For reject, move to completed immediately (realtime deduped)
      if (action === "reject") {
        setPending((prev) => {
          const match = prev.find((r) => r.id === refund.id);
          if (match) {
            setCompleted((c) => {
              if (c.some((r) => r.id === refund.id)) return c;
              return [{ ...match, status: "rejected" }, ...c];
            });
          }
          return prev.filter((r) => r.id !== refund.id);
        });
      }
    }
  }

  // Sort pending by urgency: near completion → owner required → oldest
  const sortedPending = [...pending].sort((a, b) => {
    const aScore =
      (a.votes / a.required_approvals) * 100 + (a.requires_owner ? 50 : 0);
    const bScore =
      (b.votes / b.required_approvals) * 100 + (b.requires_owner ? 50 : 0);
    if (bScore !== aScore) return bScore - aScore;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // "Needs You" filter: hide items the current admin already voted on
  const filteredPending =
    needsYouOnly && adminId
      ? sortedPending.filter(
          (r) => !r.voteDetails.some((v) => v.admin_id === adminId)
        )
      : sortedPending;

  const items = tab === "pending" ? filteredPending : completed;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={ui.h1}>Approvals</h1>
          <p className={`text-sm ${ui.muted} mt-1`}>Review and approve refund requests</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : "Live"}
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2}`}>Pending Approvals</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{pending.length}</p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2}`}>Completed</p>
          <p className="text-2xl font-bold text-white mt-1">{completed.length}</p>
        </div>
        <div className={`${ui.card} p-4`}>
          <p className={`text-xs ${ui.muted2}`}>Needs You</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            {adminId ? pending.filter((r) => !r.voteDetails.some((v) => v.admin_id === adminId)).length : "—"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition ${
              tab === "pending" ? ui.navActive : ui.navIdle
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab("completed")}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition ${
              tab === "completed" ? ui.navActive : ui.navIdle
            }`}
          >
            Completed ({completed.length})
          </button>
        </div>

        {tab === "pending" && (
          <label className="flex items-center gap-2 text-sm text-gray-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={needsYouOnly}
              onChange={() => setNeedsYouOnly(!needsYouOnly)}
              className="accent-blue-500"
            />
            Needs your approval
          </label>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : items.length === 0 ? (
        <div className={`${ui.card} p-6 text-center`}>
          <p className={tab === "pending" ? "text-green-400 font-semibold" : ui.muted}>
            {tab === "pending" ? "No pending approvals" : "No completed approvals yet"}
          </p>
          {tab === "pending" && (
            <p className={`text-sm ${ui.muted2} mt-1`}>
              Refund requests requiring approval will appear here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((r) => {
            const hasVoted = adminId
              ? r.voteDetails.some((v) => v.admin_id === adminId)
              : false;
            const isSelfRequest = adminId ? r.requested_by === adminId : false;
            const cannotAct = hasVoted || isSelfRequest;
            const nearApproval = r.votes / r.required_approvals >= 0.75;
            return (
              <div key={r.id} className={`${ui.card} p-5 rounded-2xl transition-all duration-300 hover:scale-[1.01] hover:shadow-xl cursor-pointer ${r.id === highlightId ? "ring-2 ring-blue-500/60 animate-card-enter" : ""}`} onClick={() => openDetail(r.id)}>
                {/* Card Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-lg font-semibold text-white">
                        ${Number(r.amount).toFixed(2)}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                        Refund Request
                      </span>
                      {r.requires_owner && (
                        <span className="text-xs px-2 py-1 rounded-full font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                          Owner required
                        </span>
                      )}
                      {tab === "pending" && nearApproval && (
                        <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse">
                          Near approval
                        </span>
                      )}
                      {tab === "pending" && hasVoted && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-400/20">
                          You voted
                        </span>
                      )}
                      {tab === "pending" && isSelfRequest && (
                        <span className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-400/20">
                          Your request
                        </span>
                      )}
                      {tab === "completed" && (
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                          r.status === "approved"
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {r.status === "approved" ? "Approved" : "Rejected"}
                        </span>
                      )}
                      {r.id === highlightId && (
                        <span className="text-xs text-blue-400 animate-pulse">
                          New update
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${ui.muted2} mt-2`}>
                      Tip: {r.tip_intent_id.slice(0, 8)}… ·{" "}
                      Requested by{" "}
                      <span className="text-blue-400">{userLabel(r.requested_by)}</span>
                      {" · "}
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    {r.reason && (
                      <p className="text-xs text-yellow-400 mt-1.5">
                        Reason: {REFUND_REASON_LABELS[r.reason as RefundReason] ?? r.reason}
                        {r.note && <span className={`ml-1 ${ui.muted2}`}>— {r.note}</span>}
                      </p>
                    )}
                  </div>

                  {tab === "pending" && (
                    <span className="text-lg font-bold text-yellow-400 shrink-0">
                      {r.votes}/{r.required_approvals}
                    </span>
                  )}
                </div>

                {/* Progress bar — pending only */}
                {tab === "pending" && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                      <span>Approval Progress</span>
                      <span className="font-medium">{r.votes}/{r.required_approvals}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (r.votes / r.required_approvals) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        disabled={cannotAct}
                        onClick={(e) => { e.stopPropagation(); setModal({ refund: r, action: "approve" }); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          cannotAct
                            ? "opacity-40 cursor-not-allowed bg-white/5 text-gray-500"
                            : "bg-green-500/10 text-green-400 border border-green-400/20 hover:bg-green-500/20"
                        }`}
                      >
                        {isSelfRequest ? "Can't approve own" : "Approve"}
                      </button>
                      <button
                        disabled={cannotAct}
                        onClick={(e) => { e.stopPropagation(); setModal({ refund: r, action: "reject" }); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          cannotAct
                            ? "opacity-40 cursor-not-allowed bg-white/5 text-gray-500"
                            : "bg-red-500/10 text-red-400 border border-red-400/20 hover:bg-red-500/20"
                        }`}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {/* Voters list — pending only */}
                {tab === "pending" && r.voteDetails.length > 0 && (
                  <div className="mt-3 text-xs text-gray-400">
                    Approved by:
                    <div className="flex items-center gap-2 mt-1.5">
                      {r.voteDetails.map((v) => (
                        <div
                          key={v.admin_id}
                          className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-400/20"
                        >
                          @{v.handle ?? v.admin_id.slice(0, 6)}
                          {v.role && (
                            <span className="ml-1 text-blue-400/50">({v.role})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      <AdminConfirmModal
        open={modal !== null}
        title={modal?.action === "approve" ? "Approve Refund" : "Reject Refund"}
        confirmLabel={modal?.action === "approve" ? "Submit Approval" : "Reject Refund"}
        variant={modal?.action === "approve" ? "approve" : "reject"}
        loading={acting}
        onConfirm={handleConfirm}
        onCancel={() => { setModal(null); setRejectNote(""); }}
      >
        {modal && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className={ui.muted2}>Amount</span>
                <span className="font-semibold">${Number(modal.refund.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className={ui.muted2}>Requested by</span>
                <span className="text-blue-400">{userLabel(modal.refund.requested_by)}</span>
              </div>
              {modal.refund.reason && (
                <div className="flex justify-between">
                  <span className={ui.muted2}>Reason</span>
                  <span className="text-yellow-400">
                    {REFUND_REASON_LABELS[modal.refund.reason as RefundReason] ?? modal.refund.reason}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className={ui.muted2}>Approvals</span>
                <span className="font-semibold text-yellow-400">
                  {modal.refund.votes}/{modal.refund.required_approvals}
                </span>
              </div>
            </div>

            {/* Impact warning */}
            {modal.action === "approve" && modal.refund.votes + 1 >= modal.refund.required_approvals && (
              <div className="bg-orange-500/10 border border-orange-400/20 rounded-lg p-3 text-xs text-orange-400 font-medium">
                ⚠ This approval will reach the required threshold — the refund will execute immediately.
              </div>
            )}

            {modal.action === "approve" && modal.refund.votes + 1 < modal.refund.required_approvals && (
              <p className={`text-xs ${ui.muted2}`}>
                After your vote: {modal.refund.votes + 1}/{modal.refund.required_approvals} — refund will not execute yet.
              </p>
            )}

            {/* Reject note */}
            {modal.action === "reject" && (
              <div>
                <label className={`text-xs ${ui.muted2} block mb-1`}>Rejection note (optional)</label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Why is this refund being rejected?"
                  rows={3}
                  className={`${ui.input} !py-2 !text-sm resize-none`}
                />
              </div>
            )}
          </>
        )}
      </AdminConfirmModal>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div
            className={`px-4 py-2 rounded-xl shadow-lg border text-sm font-medium ${
              toast.type === "success"
                ? "bg-green-900/80 border-green-500/30 text-green-300"
                : toast.type === "error"
                  ? "bg-red-900/80 border-red-500/30 text-red-300"
                  : "bg-zinc-900 border-zinc-700 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Detail Slide-Over Panel */}
      {detailOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/60 z-40" onClick={closeDetail} />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-zinc-950 border-l border-white/10 z-50 overflow-y-auto shadow-2xl animate-[slideIn_0.22s_ease-out]">
            {/* Panel Header */}
            <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-lg border-b border-white/10 p-5 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-semibold">Refund Details</h2>
                <p className={`text-xs ${ui.muted2} mt-0.5`}>
                  {detail?.refund?.id ? detailLabel(detail.refund.id) : "Loading…"}
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="p-2 rounded-lg hover:bg-white/10 transition text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center">
                <p className={ui.muted}>Loading details…</p>
              </div>
            ) : detail ? (
              <div className="p-5 space-y-5">

                {/* Status Banner */}
                <div className={`rounded-xl p-4 border ${
                  detail.refund.status === "pending"
                    ? "bg-yellow-500/5 border-yellow-500/20"
                    : detail.refund.status === "approved"
                      ? "bg-green-500/5 border-green-500/20"
                      : "bg-red-500/5 border-red-500/20"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${
                        detail.refund.status === "pending" ? "text-yellow-400"
                          : detail.refund.status === "approved" ? "text-green-400"
                            : "text-red-400"
                      }`}>
                        ${Number(detail.refund.amount).toFixed(2)}
                      </span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide ${
                        detail.refund.status === "pending"
                          ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                          : detail.refund.status === "approved"
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {detail.refund.status}
                      </span>
                    </div>
                    <span className={`text-xs ${ui.muted2}`}>
                      {new Date(detail.refund.created_at).toLocaleString()}
                    </span>
                  </div>
                  {detail.refund.reason && (
                    <p className="text-sm text-yellow-400 mt-2">
                      Reason: {REFUND_REASON_LABELS[detail.refund.reason as RefundReason] ?? detail.refund.reason}
                    </p>
                  )}
                  {detail.refund.note && (
                    <p className={`text-xs ${ui.muted2} mt-1`}>Note: {detail.refund.note}</p>
                  )}
                </div>

                {/* Requester */}
                <div className={`${ui.card} p-4`}>
                  <p className={`text-xs font-medium ${ui.muted2} uppercase tracking-wider mb-3`}>Requested By</p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                      {(detail.requester?.handle ?? detail.refund.requested_by)?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {detail.requester?.handle ? `@${detail.requester.handle}` : detailLabel(detail.refund.requested_by)}
                      </p>
                      <p className={`text-xs ${ui.muted2}`}>
                        {detail.requester?.role ?? "Admin"} · {detail.requester?.display_name ?? ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tip Details */}
                {detail.tip && (
                  <div className={`${ui.card} p-4`}>
                    <p className={`text-xs font-medium ${ui.muted2} uppercase tracking-wider mb-3`}>Original Tip</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className={ui.muted2}>Tip Amount</span>
                        <span className="font-semibold">${Number(detail.tip.tip_amount).toFixed(2)}</span>
                      </div>
                      {Number(detail.tip.stripe_fee ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className={ui.muted2}>Stripe Fee</span>
                          <span className="text-red-400">${Number(detail.tip.stripe_fee).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(detail.tip.platform_fee ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className={ui.muted2}>Platform Fee</span>
                          <span className="text-red-400">${Number(detail.tip.platform_fee).toFixed(2)}</span>
                        </div>
                      )}
                      {detail.tip.total_charge != null && (
                        <div className="flex justify-between border-t border-white/5 pt-2 mt-2">
                          <span className={ui.muted2}>Total Charged</span>
                          <span className="font-semibold">${Number(detail.tip.total_charge).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className={ui.muted2}>Recipient</span>
                        <span className="text-blue-400">
                          {detail.creator?.handle ? `@${detail.creator.handle}` : detailLabel(detail.tip.creator_user_id)}
                        </span>
                      </div>
                      {detail.tip.supporter_name && (
                        <div className="flex justify-between">
                          <span className={ui.muted2}>Supporter</span>
                          <span>{detail.tip.supporter_name}{detail.tip.is_anonymous ? " (anon)" : ""}</span>
                        </div>
                      )}
                      {(detail.tip.note || detail.tip.message) && (
                        <div className="mt-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                          <p className={`text-xs ${ui.muted2} mb-1`}>Message</p>
                          <p className="text-xs text-gray-300">{detail.tip.note || detail.tip.message}</p>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className={ui.muted2}>Tip Status</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          detail.tip.status === "succeeded"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}>
                          {detail.tip.status}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className={ui.muted2}>Refund Status</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          detail.tip.refund_status === "none"
                            ? "bg-gray-500/10 text-gray-400"
                            : detail.tip.refund_status === "full"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-yellow-500/10 text-yellow-400"
                        }`}>
                          {detail.tip.refund_status}
                        </span>
                      </div>
                      {detail.tip.refunded_amount > 0 && (
                        <div className="flex justify-between">
                          <span className={ui.muted2}>Already Refunded</span>
                          <span className="text-orange-400">${Number(detail.tip.refunded_amount).toFixed(2)}</span>
                        </div>
                      )}
                      {detail.tip.failure_reason && (
                        <div className="mt-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                          <p className="text-xs text-red-400">Failure: {detail.tip.failure_reason}</p>
                        </div>
                      )}
                      {(detail.tip.payment_intent_id || (detail.tip as Record<string, unknown>).stripe_payment_intent_id) ? (
                        <div className="flex justify-between">
                          <span className={ui.muted2}>Stripe PI</span>
                          <span className="text-xs font-mono text-gray-500">
                            {String(detail.tip.payment_intent_id || (detail.tip as Record<string, unknown>).stripe_payment_intent_id || "").slice(0, 20)}…
                          </span>
                        </div>
                      ) : null}
                      <div className="flex justify-between">
                        <span className={ui.muted2}>Tip Created</span>
                        <span className={`text-xs ${ui.muted2}`}>{new Date(detail.tip.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Approval Progress */}
                <div className={`${ui.card} p-4`}>
                  <p className={`text-xs font-medium ${ui.muted2} uppercase tracking-wider mb-3`}>Approval Progress</p>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (detail.voteTimeline.length / detail.refund.required_approvals) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-yellow-400">
                      {detail.voteTimeline.length}/{detail.refund.required_approvals}
                    </span>
                  </div>
                  {detail.refund.requires_owner && (
                    <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 mb-3">
                      Owner approval required
                    </div>
                  )}

                  {/* Vote Timeline */}
                  {detail.voteTimeline.length > 0 ? (
                    <div className="space-y-2">
                      {detail.voteTimeline.map((v, i) => (
                        <div key={v.admin_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03]">
                          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {v.handle ? `@${v.handle}` : v.display_name ?? v.admin_id.slice(0, 8)}
                            </p>
                            <p className={`text-xs ${ui.muted2}`}>
                              {v.role ?? "Admin"} · {new Date(v.voted_at).toLocaleString()}
                            </p>
                          </div>
                          <span className="text-xs text-green-400">✓ Approved</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-xs ${ui.muted2}`}>No votes yet</p>
                  )}
                </div>

                {/* Risk Alerts */}
                {detail.riskAlerts.length > 0 && (
                  <div className={`${ui.card} p-4`}>
                    <p className={`text-xs font-medium ${ui.muted2} uppercase tracking-wider mb-3`}>
                      Risk Alerts ({detail.riskAlerts.filter((a) => !a.resolved).length} unresolved)
                    </p>
                    <div className="space-y-2">
                      {detail.riskAlerts.map((a) => (
                        <div key={a.id} className={`p-2.5 rounded-lg border text-xs ${
                          a.severity === "critical"
                            ? "bg-red-500/5 border-red-500/20 text-red-400"
                            : a.severity === "warning"
                              ? "bg-orange-500/5 border-orange-500/20 text-orange-400"
                              : "bg-blue-500/5 border-blue-500/20 text-blue-400"
                        } ${a.resolved ? "opacity-50" : ""}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{a.type.replace(/_/g, " ")}</span>
                            {a.resolved && <span className="text-green-400 text-[10px]">Resolved</span>}
                          </div>
                          <p>{a.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit Trail */}
                {detail.auditTrail.length > 0 && (
                  <div className={`${ui.card} p-4`}>
                    <p className={`text-xs font-medium ${ui.muted2} uppercase tracking-wider mb-3`}>Audit Trail</p>
                    <div className="space-y-1.5">
                      {detail.auditTrail.map((a) => (
                        <div key={a.id} className="flex items-start gap-2 text-xs py-1.5">
                          <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            a.severity === "critical" ? "bg-red-400"
                              : a.severity === "warning" ? "bg-orange-400"
                                : "bg-gray-500"
                          }`} />
                          <div className="min-w-0">
                            <span className="font-medium text-gray-300">{a.action.replace(/_/g, " ")}</span>
                            {a.reason && <span className={` ${ui.muted2}`}> — {a.reason}</span>}
                            <p className={`${ui.muted2} mt-0.5`}>{new Date(a.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lock Status */}
                {detail.refund.locked_at && (
                  <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-xs text-orange-400">
                    ⏳ Execution in progress since {new Date(detail.refund.locked_at).toLocaleString()}
                  </div>
                )}

              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-red-400">Failed to load details</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
