"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import { REFUND_REASON_LABELS, type RefundReason } from "@/lib/refundReasons";
import { useToast } from "@/lib/useToast";
import AdminConfirmModal from "@/components/AdminConfirmModal";

type VoteDetail = {
  admin_id: string;
  profiles: { handle: string | null; role: string | null } | null;
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

  // Dedup: prevent double-processing of realtime events
  const processedEvents = useRef(new Set<string>());
  // Cache: avoid repeated profile fetches
  const profileCache = useRef(new Map<string, VoteDetail["profiles"]>());

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
    if (cached) return { admin_id: uid, profiles: cached };
    const { data } = await supabase
      .from("profiles")
      .select("handle, role")
      .eq("user_id", uid)
      .single();
    const prof = data ?? null;
    if (prof) profileCache.current.set(uid, prof);
    return { admin_id: uid, profiles: prof };
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
          processedEvents.current.add(key);

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
          processedEvents.current.add(key);

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
                  { admin_id: vote.admin_id, profiles: null },
                ],
              };
            })
          );
          // Backfill voter profile (cached)
          fetchVoterProfile(vote.admin_id).then((detail) => {
            setPending((prev) =>
              prev.map((r) => {
                if (r.id !== vote.refund_id) return r;
                return {
                  ...r,
                  voteDetails: r.voteDetails.map((v) =>
                    v.admin_id === vote.admin_id && !v.profiles ? detail : v
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
          processedEvents.current.add(key);

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

  async function loadAll() {
    setLoading(true);

    // Fetch pending requests
    const { data: pendingData } = await supabase
      .from("refund_requests")
      .select("id, tip_intent_id, requested_by, amount, status, required_approvals, requires_owner, reason, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Fetch completed requests (approved + rejected, last 50)
    const { data: completedData } = await supabase
      .from("refund_requests")
      .select("id, tip_intent_id, requested_by, amount, status, required_approvals, requires_owner, reason, note, created_at")
      .in("status", ["approved", "rejected"])
      .order("created_at", { ascending: false })
      .limit(50);

    const allRequests = [...(pendingData ?? []), ...(completedData ?? [])];

    // Get vote details (with profiles) for pending requests
    const pendingIds = (pendingData ?? []).map((r) => r.id);
    let votesByRefund: Record<string, VoteDetail[]> = {};
    if (pendingIds.length > 0) {
      const { data: votesData } = await supabase
        .from("refund_approval_votes")
        .select("refund_id, admin_id, profiles:admin_id ( handle, role )")
        .in("refund_id", pendingIds);
      for (const v of votesData ?? []) {
        const rid = v.refund_id as string;
        if (!votesByRefund[rid]) votesByRefund[rid] = [];
        const prof = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
        votesByRefund[rid].push({
          admin_id: v.admin_id as string,
          profiles: (prof as VoteDetail["profiles"]) ?? null,
        });
      }
    }

    const pendingWithVotes = (pendingData ?? []).map((r) => {
      const details = votesByRefund[r.id] ?? [];
      return { ...r, votes: details.length, voteDetails: details } as RefundRequest;
    });

    const completedWithVotes = (completedData ?? []).map((r) => ({
      ...r,
      votes: r.required_approvals,
      voteDetails: [],
    })) as RefundRequest[];

    setPending(pendingWithVotes);
    setCompleted(completedWithVotes);

    // Batch-fetch profiles for all requesters
    const ids = [...new Set(allRequests.map((r) => r.requested_by))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", ids);
      const map: Record<string, ProfileInfo> = {};
      for (const p of profiles ?? []) {
        map[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
      setProfileMap(map);
    }

    setLoading(false);
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
      processedEvents.current.add(`votes:INSERT:${refund.id}:${adminId}`);
      setPending((prev) =>
        prev.map((r) =>
          r.id === refund.id
            ? {
                ...r,
                votes: r.votes + 1,
                voteDetails: [
                  ...r.voteDetails,
                  { admin_id: adminId, profiles: null },
                ],
              }
            : r
        )
      );
    }
    if (action === "reject") {
      processedEvents.current.add(`refund_requests:UPDATE:${refund.id}:rejected`);
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
      showToast(
        action === "approve" ? "Approval submitted" : "Refund rejected",
        "success"
      );
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
    <div className="space-y-4">
      <h1 className={ui.h1}>
        Approvals
        {pending.length > 0 && (
          <span className="ml-3 text-sm px-2.5 py-1 rounded-full font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 align-middle">
            {pending.length} pending
          </span>
        )}
        <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-gray-500 align-middle font-normal">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : "Live"}
        </span>
      </h1>

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
        <div className="space-y-3">
          {items.map((r) => {
            const hasVoted = adminId
              ? r.voteDetails.some((v) => v.admin_id === adminId)
              : false;
            return (
              <div key={r.id} className={`${ui.card} p-4 space-y-2 transition-all duration-300 ${r.id === highlightId ? "ring-2 ring-blue-500/60" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">
                        ${Number(r.amount).toFixed(2)} refund
                      </span>
                      {r.requires_owner && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          Owner required
                        </span>
                      )}
                      {tab === "pending" && hasVoted && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400">
                          You voted
                        </span>
                      )}
                      {tab === "completed" && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          r.status === "approved"
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {r.status === "approved" ? "Approved" : "Rejected"}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${ui.muted2} mt-1`}>
                      Tip: {r.tip_intent_id.slice(0, 8)}… ·{" "}
                      Requested by{" "}
                      <span className="text-blue-400">{userLabel(r.requested_by)}</span>
                      {" · "}
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    {r.reason && (
                      <p className="text-xs text-yellow-400 mt-1">
                        Reason: {REFUND_REASON_LABELS[r.reason as RefundReason] ?? r.reason}
                        {r.note && <span className={`ml-1 ${ui.muted2}`}>— {r.note}</span>}
                      </p>
                    )}
                  </div>

                  {tab === "pending" && (
                    <span className="text-sm font-bold text-yellow-400 shrink-0">
                      {r.votes}/{r.required_approvals}
                    </span>
                  )}
                </div>

                {/* Progress bar — pending only */}
                {tab === "pending" && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (r.votes / r.required_approvals) * 100)}%` }}
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        disabled={hasVoted}
                        onClick={() => setModal({ refund: r, action: "approve" })}
                        className={`${ui.btnGhost} ${ui.btnSmall} ${
                          hasVoted
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-green-500/20 hover:border-green-400/30"
                        }`}
                      >
                        Approve
                      </button>
                      <button
                        disabled={hasVoted}
                        onClick={() => setModal({ refund: r, action: "reject" })}
                        className={`${ui.btnGhost} ${ui.btnSmall} ${
                          hasVoted
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-red-500/20 hover:border-red-400/30"
                        }`}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {/* Voters list — pending only */}
                {tab === "pending" && r.voteDetails.length > 0 && (
                  <div className="mt-2 text-xs text-gray-400">
                    Approved by:
                    <div className="mt-1 flex flex-wrap gap-2">
                      {r.voteDetails.map((v) => (
                        <span
                          key={v.admin_id}
                          className="px-2 py-1 rounded bg-zinc-800 text-white"
                        >
                          @{v.profiles?.handle ?? v.admin_id.slice(0, 8)}
                          {v.profiles?.role && (
                            <span className="ml-1 text-gray-500">({v.profiles.role})</span>
                          )}
                        </span>
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
        <div className="fixed bottom-4 right-4 z-50">
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
    </div>
  );
}
