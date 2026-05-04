"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";
import DisputeTimeline from "@/components/admin/DisputeTimeline";
import AICasePanel from "@/components/admin/AICasePanel";

type DisputedTip = {
  receipt_id: string;
  creator_user_id: string;
  tip_amount: number;
  refunded_amount: number;
  refund_status: string;
  stripe_payment_intent_id: string | null;
  status: string;
  created_at: string;
};

type QueueView = "active" | "resolved" | "all";
type StatusFilter = "all" | "disputed" | "dispute_resolved" | "dispute_countered";

type RecentlyResolvedItem = {
  receipt_id: string;
  creator_user_id: string;
  tip_amount: number;
  status: "dispute_resolved" | "dispute_countered";
  resolved_at: string;
};

type PendingApproval = {
  id: string;
  receipt_id: string;
  action: "accept" | "counter";
  note: string;
  proposed_by: string;
  proposed_by_role: string;
  proposed_at: string;
  status: string;
};

type Severity = "HIGH" | "MEDIUM" | "LOW";

function getSeverity(count: number): Severity {
  if (count >= 3) return "HIGH";
  if (count >= 1) return "MEDIUM";
  return "LOW";
}

function severityStyle(s: Severity) {
  switch (s) {
    case "HIGH":
      return "text-red-400 bg-red-500/10 border-red-400/20";
    case "MEDIUM":
      return "text-yellow-400 bg-yellow-500/10 border-yellow-400/20";
    case "LOW":
      return "text-green-400 bg-green-500/10 border-green-400/20";
  }
}

function severityGlow(s: Severity) {
  switch (s) {
    case "HIGH":
      return "hover:shadow-[0_0_25px_rgba(255,0,0,0.25)]";
    case "MEDIUM":
      return "hover:shadow-[0_0_20px_rgba(255,200,0,0.25)]";
    case "LOW":
      return "hover:shadow-[0_0_20px_rgba(0,255,150,0.2)]";
  }
}

function severityAccent(s: Severity) {
  switch (s) {
    case "HIGH":
      return "bg-red-500";
    case "MEDIUM":
      return "bg-yellow-400";
    case "LOW":
      return "bg-green-400";
  }
}

function statusLabel(status: string) {
  if (status === "disputed") return "Disputed";
  if (status === "dispute_resolved") return "Resolved";
  if (status === "dispute_countered") return "Countered";
  return status;
}

function statusStyle(status: string) {
  if (status === "disputed") return "text-red-400 bg-red-500/10 border-red-400/20";
  if (status === "dispute_resolved") return "text-green-400 bg-green-500/10 border-green-400/20";
  if (status === "dispute_countered") return "text-blue-400 bg-blue-500/10 border-blue-400/20";
  return "text-gray-300 bg-white/5 border-white/10";
}

export default function AdminDisputesPage() {
  const [tips, setTips] = useState<DisputedTip[]>([]);
  const [queueView, setQueueView] = useState<QueueView>("active");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [recentlyResolved, setRecentlyResolved] = useState<RecentlyResolvedItem[]>([]);
  const [creatorCounts, setCreatorCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Record<string, { handle: string | null; display_name: string | null }>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [resolveTarget, setResolveTarget] = useState<DisputedTip | null>(null);
  const [resolveAction, setResolveAction] = useState<"accept" | "counter">("accept");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approveTarget, setApproveTarget] = useState<PendingApproval | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [claiming, setClaiming] = useState<string | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Read admin identity from localStorage
    try {
      const raw = localStorage.getItem("admin_session");
      if (raw) {
        const identity = JSON.parse(raw);
        setAdminRole(identity.role ?? null);
        setAdminId(identity.id ?? null);
      }
    } catch { /* no-op */ }
  }, []);

  useEffect(() => {
    fetchDisputes();
    fetchPendingApprovals();
    const interval = setInterval(() => { fetchDisputes(); fetchPendingApprovals(); }, 15000);
    return () => clearInterval(interval);
  }, [queueView, statusFilter]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        fetchDisputes();
        fetchPendingApprovals();
        refreshTimerRef.current = null;
      }, 700);
    };

    const disputesChannel = supabase
      .channel("admin-disputes-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tip_intents" },
        (payload) => {
          const row = payload.new as { status?: string };
          if (!["disputed", "dispute_resolved", "dispute_countered"].includes(row.status ?? "")) return;
          scheduleRefresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tip_intents" },
        (payload) => {
          const next = payload.new as { status?: string };
          const prev = payload.old as { status?: string };
          const relevant = ["disputed", "dispute_resolved", "dispute_countered"];
          if (!relevant.includes(next.status ?? "") && !relevant.includes(prev.status ?? "")) return;
          scheduleRefresh();
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    const approvalsChannel = supabase
      .channel("admin-dispute-approvals-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispute_approvals" },
        () => scheduleRefresh()
      )
      .subscribe();

    const assignmentsChannel = supabase
      .channel("admin-dispute-assignments-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispute_assignments" },
        () => scheduleRefresh()
      )
      .subscribe();

    return () => {
      setIsLive(false);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(disputesChannel);
      supabase.removeChannel(approvalsChannel);
      supabase.removeChannel(assignmentsChannel);
    };
  }, []);

  async function fetchDisputes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      } else {
        params.set("status", queueView);
      }
      const res = await fetch(`/api/admin/disputes?${params.toString()}`, { headers: getAdminHeaders() });
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      const disputes: DisputedTip[] = json.data ?? [];
      setTips(disputes);

      const counts: Record<string, number> = {};
      for (const d of disputes) {
        counts[d.creator_user_id] = (counts[d.creator_user_id] ?? 0) + 1;
      }
      setCreatorCounts(counts);
      setProfileMap(json.profiles ?? {});
      setAssignments(json.assignments ?? {});
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }

  async function claimCase(disputeId: string) {
    setClaiming(disputeId);
    try {
      const res = await fetch("/api/admin/disputes/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ dispute_id: disputeId }),
      });
      if (res.ok) {
        fetchDisputes();
      } else {
        const json = await res.json();
        alert(json.error || "Already claimed by another admin");
      }
    } catch {
      alert("Error claiming case");
    } finally {
      setClaiming(null);
    }
  }

  async function releaseCase(disputeId: string) {
    setClaiming(disputeId);
    try {
      const res = await fetch("/api/admin/disputes/claim", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ dispute_id: disputeId }),
      });
      if (res.ok) {
        fetchDisputes();
      } else {
        const json = await res.json();
        alert(json.error || "Failed to release case");
      }
    } catch {
      alert("Error releasing case");
    } finally {
      setClaiming(null);
    }
  }

  async function fetchPendingApprovals() {
    try {
      const res = await fetch("/api/admin/disputes/resolve", { headers: getAdminHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      setPendingApprovals(json.approvals ?? []);
    } catch { /* no-op */ }
  }

  function userLabel(id: string) {
    const p = profileMap[id];
    if (p?.handle) return `@${p.handle}`;
    if (p?.display_name) return p.display_name;
    return `${id.slice(0, 8)}…`;
  }

  const highRiskCount = Object.values(creatorCounts).filter((c) => c >= 3).length;
  const medRiskCount = Object.values(creatorCounts).filter((c) => c >= 1 && c < 3).length;
  const totalAmount = tips.reduce((sum, t) => sum + Number(t.tip_amount ?? 0), 0);
  const claimedCount = Object.keys(assignments).length;
  const myClaimedCount = Object.values(assignments).filter((id) => id === adminId).length;

  async function handleResolve() {
    if (!resolveTarget) return;
    if (!resolveNote.trim()) {
      setResolveError("Internal note is mandatory");
      return;
    }
    setResolving(true);
    setResolveError(null);
    try {
      const target = resolveTarget;
      const res = await fetch("/api/admin/disputes/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          receipt_id: target.receipt_id,
          action: resolveAction,
          note: resolveNote.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResolveError(json.error || "Failed to resolve dispute");
        return;
      }
      // If finalized (owner), show resolved transition before removing from active queue.
      if (json.step === "finalized") {
        const finalizedStatus = (resolveAction === "accept" ? "dispute_resolved" : "dispute_countered") as "dispute_resolved" | "dispute_countered";

        setTips((prev) => prev.map((t) => t.receipt_id === target.receipt_id ? { ...t, status: finalizedStatus } : t));
        setResolvedIds((prev) => {
          const next = new Set(prev);
          next.add(target.receipt_id);
          return next;
        });
        setRecentlyResolved((prev) => [
          {
            receipt_id: target.receipt_id,
            creator_user_id: target.creator_user_id,
            tip_amount: Number(target.tip_amount ?? 0),
            status: finalizedStatus,
            resolved_at: new Date().toISOString(),
          },
          ...prev.filter((item) => item.receipt_id !== target.receipt_id),
        ].slice(0, 10));

        setTimeout(() => {
          setResolvedIds((prev) => {
            const next = new Set(prev);
            next.delete(target.receipt_id);
            return next;
          });
          if (queueView === "active" || statusFilter === "disputed") {
            setTips((prev) => prev.filter((t) => t.receipt_id !== target.receipt_id));
          }
          fetchDisputes();
        }, 1200);
      } else {
        fetchDisputes();
      }

      setResolveTarget(null);
      setResolveNote("");
      setResolveAction("accept");
      fetchPendingApprovals();
    } catch {
      setResolveError("Network error");
    } finally {
      setResolving(false);
    }
  }

  async function handleApprove() {
    if (!approveTarget) return;
    if (!approveNote.trim()) {
      setApproveError("Internal note is mandatory");
      return;
    }
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch("/api/admin/disputes/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          approval_id: approveTarget.id,
          note: approveNote.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setApproveError(json.error || "Failed to approve");
        return;
      }
      setApproveTarget(null);
      setApproveNote("");
      fetchDisputes();
      fetchPendingApprovals();
    } catch {
      setApproveError("Network error");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject(approvalId: string) {
    try {
      await fetch("/api/admin/disputes/resolve", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ approval_id: approvalId, reject_note: "Rejected by admin" }),
      });
      fetchPendingApprovals();
    } catch { /* no-op */ }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Disputes</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {lastUpdated ? `Live · Updated ${lastUpdated.toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLive ? "bg-emerald-500" : "bg-amber-500"}`} />
          </span>
          <span className={`text-xs font-medium ${isLive ? "text-emerald-400" : "text-amber-400"}`}>{isLive ? "Live" : "Connecting..."}</span>
        </div>
      </div>

      {/* Queue View + Status Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button
            onClick={() => { setQueueView("active"); setStatusFilter("all"); }}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${queueView === "active" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"}`}
          >
            Active
          </button>
          <button
            onClick={() => { setQueueView("resolved"); setStatusFilter("all"); }}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${queueView === "resolved" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"}`}
          >
            Resolved
          </button>
          <button
            onClick={() => { setQueueView("all"); setStatusFilter("all"); }}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${queueView === "all" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"}`}
          >
            All
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {([
            ["all", "All"],
            ["disputed", "Disputed"],
            ["dispute_resolved", "Resolved"],
            ["dispute_countered", "Countered"],
          ] as Array<[StatusFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${statusFilter === value ? "border-white/30 text-white bg-white/10" : "border-white/10 text-white/50 hover:text-white/70"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {recentlyResolved.length > 0 && (
        <div className="p-4 rounded-xl border border-green-400/20 bg-green-500/5">
          <p className="text-xs font-semibold tracking-widest text-green-300 uppercase mb-2">Recently Resolved</p>
          <div className="space-y-1.5">
            {recentlyResolved.slice(0, 5).map((item) => (
              <div key={item.receipt_id} className="text-xs text-green-200/90 flex items-center justify-between gap-2">
                <span>✓ {statusLabel(item.status)} · ${item.tip_amount.toFixed(2)} · {userLabel(item.creator_user_id)}</span>
                <span className="text-green-200/50">{new Date(item.resolved_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
          <p className="text-xs text-gray-400 font-medium">Total Cases</p>
          <p className="text-2xl font-bold text-white mt-1">{tips.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
          <p className="text-xs text-gray-400 font-medium">At Risk</p>
          <p className="text-2xl font-bold text-white mt-1">${totalAmount.toFixed(2)}</p>
        </div>
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-400/20 backdrop-blur-sm">
          <p className="text-xs text-red-300 font-medium">High Severity</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{highRiskCount}</p>
        </div>
        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-400/20 backdrop-blur-sm">
          <p className="text-xs text-yellow-300 font-medium">Medium Severity</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{medRiskCount}</p>
        </div>
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-400/20 backdrop-blur-sm">
          <p className="text-xs text-purple-300 font-medium">Pending Approval</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{pendingApprovals.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-400/20 backdrop-blur-sm">
          <p className="text-xs text-blue-300 font-medium">Claimed</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            {claimedCount}
            {myClaimedCount > 0 && (
              <span className="text-sm font-normal text-green-400 ml-1">({myClaimedCount} mine)</span>
            )}
          </p>
        </div>
      </div>

      {/* Pending Approvals Queue */}
      {pendingApprovals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
            Awaiting Final Approval
          </h2>
          {pendingApprovals.map((ap) => {
            const matchingTip = tips.find((t) => t.receipt_id === ap.receipt_id);
            const canApprove = ap.proposed_by !== adminId && (adminRole === "owner" || adminRole === "super_admin");

            return (
              <div
                key={ap.id}
                className="relative overflow-hidden p-4 rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-500/5 to-white/0 backdrop-blur-xl"
              >
                <div className="absolute left-0 top-0 h-full w-[3px] rounded-l-2xl bg-purple-400" />
                <div className="flex justify-between items-start gap-4 pl-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        ap.action === "accept"
                          ? "bg-red-500/10 border border-red-400/20 text-red-400"
                          : "bg-blue-500/10 border border-blue-400/20 text-blue-400"
                      }`}>
                        {ap.action === "accept" ? "Accept Loss" : "Counter"}
                      </span>
                      <span className="text-xs text-gray-500">
                        Proposed by <span className="text-gray-300 font-medium">{ap.proposed_by_role.replace("_", " ")}</span>
                      </span>
                    </div>
                    {matchingTip && (
                      <p className="text-lg font-bold text-white">${Number(matchingTip.tip_amount).toFixed(2)}</p>
                    )}
                    <p className="text-xs text-gray-400 italic">&ldquo;{ap.note}&rdquo;</p>
                    <p className="text-xs text-gray-600">{new Date(ap.proposed_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canApprove ? (
                      <>
                        <button
                          onClick={() => { setApproveTarget(ap); setApproveNote(""); setApproveError(null); }}
                          className="text-xs px-4 py-2 rounded-lg bg-green-500/10 border border-green-400/20 text-green-400 hover:bg-green-500/20 transition-all"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(ap.id)}
                          className="text-xs px-4 py-2 rounded-lg bg-red-500/10 border border-red-400/20 text-red-400 hover:bg-red-500/20 transition-all"
                        >
                          Reject
                        </button>
                      </>
                    ) : ap.proposed_by === adminId ? (
                      <span className="text-xs text-gray-500 italic py-2">Your proposal — awaiting approval</span>
                    ) : (
                      <span className="text-xs text-gray-500 italic py-2">Higher role required</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dispute Cards */}
      {loading && tips.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
      ) : tips.length === 0 ? (
        <div className="p-10 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 backdrop-blur-xl text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-green-400 font-semibold text-lg">No Cases Found</p>
          <p className="text-sm text-gray-500 mt-1">
            {queueView === "active" && statusFilter === "all"
              ? <>No active disputes. Chargebacks will appear here when Stripe fires <code className="text-gray-400">charge.dispute.created</code>.</>
              : "No disputes match the selected lifecycle filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tips.map((t) => {
            const count = creatorCounts[t.creator_user_id] ?? 1;
            const severity = getSeverity(count);
            const isExpanded = expandedCase === t.receipt_id;

            return (
              <div
                key={t.receipt_id}
                className={`
                  relative overflow-hidden rounded-2xl border
                  ${assignments[t.receipt_id]
                    ? assignments[t.receipt_id] === adminId
                      ? "border-green-400/20 bg-gradient-to-br from-green-500/5 to-white/0"
                      : "border-blue-400/20 bg-gradient-to-br from-blue-500/5 to-white/0"
                    : "border-white/10 bg-gradient-to-br from-white/5 to-white/0"
                  }
                  backdrop-blur-xl transition-all duration-300
                  ${severityGlow(severity)}
                `}
              >
                {/* Left accent bar */}
                <div className={`absolute left-0 top-0 h-full w-[3px] rounded-l-2xl ${severityAccent(severity)}`} />

                {/* Clickable summary row — always visible */}
                <button
                  type="button"
                  onClick={() => setExpandedCase(isExpanded ? null : t.receipt_id)}
                  className="w-full text-left p-5 flex justify-between items-center gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Left content */}
                  <div className="flex items-center gap-4 min-w-0 pl-2">
                    <div className="min-w-0">
                      <p className="text-2xl font-bold text-white">${Number(t.tip_amount).toFixed(2)}</p>
                      <p className="text-sm text-gray-400 truncate">
                        {userLabel(t.creator_user_id)} · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Right side: badges + chevron */}
                  <div className="flex items-center gap-3 shrink-0">
                    {assignments[t.receipt_id] && (
                      <span className={`text-[10px] font-medium ${assignments[t.receipt_id] === adminId ? "text-green-400" : "text-blue-400"}`}>
                        {assignments[t.receipt_id] === adminId ? "Yours" : "Claimed"}
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${severityStyle(severity)}`}>
                      {severity} · {count}
                    </span>
                    <span className={`text-xs font-semibold rounded-full px-3 py-1 border ${statusStyle(t.status)}`}>
                      {statusLabel(t.status)}
                    </span>
                    {resolvedIds.has(t.receipt_id) && (
                      <span className="text-xs font-semibold text-green-300 bg-green-500/15 border border-green-400/20 rounded-full px-3 py-1 animate-pulse">
                        Resolved ✓
                      </span>
                    )}
                    <span className={`text-gray-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t border-white/5">
                    {/* Detail info */}
                    <div className="pt-4 pl-2 space-y-1.5">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Dispute Case</p>
                      <p className="text-sm text-gray-300">
                        Creator:{" "}
                        <Link
                          href={`/admin/users/${t.creator_user_id}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                        >
                          {userLabel(t.creator_user_id)}
                        </Link>
                      </p>
                      <p className="text-xs text-gray-500">{new Date(t.created_at).toLocaleString()}</p>
                      {t.stripe_payment_intent_id && (
                        <p className="text-xs text-gray-600 truncate font-mono">
                          PI: {t.stripe_payment_intent_id}
                        </p>
                      )}
                    </div>

                    {/* Claim status */}
                    {assignments[t.receipt_id] && (
                      <div className="pl-2 flex items-center gap-2">
                        {assignments[t.receipt_id] === adminId ? (
                          <span className="text-xs text-green-400 font-medium">• You own this case</span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            👤 Claimed by {userLabel(assignments[t.receipt_id])}
                          </span>
                        )}
                      </div>
                    )}

                    {/* AI Case Analysis Panel */}
                    <AICasePanel receiptId={t.receipt_id} />

                    {/* Actions */}
                    <div className="flex flex-wrap justify-end gap-2 pl-2">
                      {/* Claim / Release */}
                      {!assignments[t.receipt_id] ? (
                        <button
                          onClick={() => claimCase(t.receipt_id)}
                          disabled={claiming === t.receipt_id}
                          className="text-xs px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-400/20 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-50"
                        >
                          {claiming === t.receipt_id ? "Claiming…" : "Claim Case"}
                        </button>
                      ) : (assignments[t.receipt_id] === adminId || adminRole === "owner") ? (
                        <button
                          onClick={() => releaseCase(t.receipt_id)}
                          disabled={claiming === t.receipt_id}
                          className="text-xs px-3 py-2 rounded-lg bg-red-500/10 border border-red-400/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                        >
                          {claiming === t.receipt_id ? "Releasing…" : "Release"}
                        </button>
                      ) : null}

                      <Link
                        href={`/admin/users/${t.creator_user_id}`}
                        className="text-xs px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                      >
                        View Creator
                      </Link>
                      {t.status !== "disputed" ? (
                        <span className="text-xs px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400">
                          Closed Case
                        </span>
                      ) : pendingApprovals.some((ap) => ap.receipt_id === t.receipt_id) ? (
                        <span className="text-xs px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-400/20 text-purple-400">
                          Pending Approval ↑
                        </span>
                      ) : (
                        <button
                          onClick={() => { setResolveTarget(t); setResolveAction("accept"); setResolveNote(""); setResolveError(null); }}
                          className="text-xs px-4 py-2 rounded-lg bg-green-500/10 border border-green-400/20 text-green-400 hover:bg-green-500/20 transition-all"
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        onClick={() => setTimelineTarget(t.receipt_id)}
                        className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                      >
                        📜 Timeline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolve Modal */}
      {resolveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-2xl bg-gray-900 border border-white/10 p-6 space-y-5 shadow-2xl">
            {/* Header */}
            <div>
              <h3 className="text-lg font-bold text-white">
                {adminRole === "owner" ? "Resolve Dispute" : "Propose Resolution"}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                ${Number(resolveTarget.tip_amount).toFixed(2)} — {userLabel(resolveTarget.creator_user_id)}
              </p>
            </div>

            {/* Role notice */}
            {adminRole !== "owner" && (
              <div className="p-3 rounded-lg text-xs bg-purple-500/10 border border-purple-400/20 text-purple-300">
                {adminRole === "finance_admin"
                  ? "As a finance admin, your resolution will be queued for approval by a super admin or owner."
                  : "As a super admin, your resolution needs approval from another super admin or the owner."}
              </div>
            )}

            {/* Action Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setResolveAction("accept")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  resolveAction === "accept"
                    ? "bg-red-500/15 border-red-400/30 text-red-400"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                }`}
              >
                Accept Loss
              </button>
              <button
                onClick={() => setResolveAction("counter")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  resolveAction === "counter"
                    ? "bg-blue-500/15 border-blue-400/30 text-blue-400"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                }`}
              >
                Counter Dispute
              </button>
            </div>

            {/* Explanation */}
            <div className={`p-3 rounded-lg text-xs ${
              resolveAction === "accept"
                ? "bg-red-500/10 border border-red-400/20 text-red-300"
                : "bg-blue-500/10 border border-blue-400/20 text-blue-300"
            }`}>
              {resolveAction === "accept" ? (
                <>Closes the dispute on Stripe. The chargeback stands and funds are returned to the cardholder. If this is the creator&apos;s only dispute, their account restriction will be lifted.</>
              ) : (
                <>Submits evidence to Stripe to fight the dispute. Stripe will review and make a final decision (usually 60–75 days). The tip status will change to &quot;countered&quot;.</>
              )}
            </div>

            {/* Note — MANDATORY */}
            <div>
              <label className="text-xs font-medium block mb-1.5">
                <span className="text-gray-400">
                  {resolveAction === "counter" ? "Evidence note (sent to Stripe)" : "Internal note"}
                </span>
                <span className="text-red-400 ml-1">*</span>
              </label>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder={resolveAction === "counter"
                  ? "This was a voluntary tip made by the cardholder..."
                  : "Reason for accepting this dispute..."}
                className={`w-full bg-white/5 border rounded-lg p-3 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-white/20 ${
                  resolveError === "Internal note is mandatory" && !resolveNote.trim()
                    ? "border-red-400/50"
                    : "border-white/10"
                }`}
                rows={3}
              />
            </div>

            {/* Error */}
            {resolveError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 rounded-lg p-2.5">{resolveError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setResolveTarget(null); setResolveError(null); }}
                disabled={resolving}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={resolving || !resolveNote.trim()}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all disabled:opacity-50 ${
                  resolveAction === "accept"
                    ? "bg-red-500/20 border-red-400/30 text-red-400 hover:bg-red-500/30"
                    : "bg-blue-500/20 border-blue-400/30 text-blue-400 hover:bg-blue-500/30"
                }`}
              >
                {resolving
                  ? "Processing…"
                  : adminRole === "owner"
                    ? resolveAction === "accept" ? "Accept & Close" : "Submit Evidence"
                    : resolveAction === "accept" ? "Propose Accept" : "Propose Counter"
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-2xl bg-gray-900 border border-white/10 p-6 space-y-5 shadow-2xl">
            <div>
              <h3 className="text-lg font-bold text-white">Final Approval</h3>
              <p className="text-sm text-gray-400 mt-1">
                Review and approve the proposed resolution
              </p>
            </div>

            {/* Proposal Summary */}
            <div className="p-3 rounded-lg text-xs bg-white/5 border border-white/10 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Action:</span>
                <span className={approveTarget.action === "accept" ? "text-red-400 font-semibold" : "text-blue-400 font-semibold"}>
                  {approveTarget.action === "accept" ? "Accept Loss" : "Counter Dispute"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Proposed by:</span>
                <span className="text-gray-300">{approveTarget.proposed_by_role.replace("_", " ")}</span>
              </div>
              <div>
                <span className="text-gray-400">Their note:</span>
                <p className="text-gray-200 mt-1 italic">&ldquo;{approveTarget.note}&rdquo;</p>
              </div>
            </div>

            {/* Approver Note — MANDATORY */}
            <div>
              <label className="text-xs font-medium block mb-1.5">
                <span className="text-gray-400">Approval note</span>
                <span className="text-red-400 ml-1">*</span>
              </label>
              <textarea
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                placeholder="Reason for approving this resolution..."
                className={`w-full bg-white/5 border rounded-lg p-3 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-white/20 ${
                  approveError === "Internal note is mandatory" && !approveNote.trim()
                    ? "border-red-400/50"
                    : "border-white/10"
                }`}
                rows={3}
              />
            </div>

            {/* Error */}
            {approveError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-400/20 rounded-lg p-2.5">{approveError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setApproveTarget(null); setApproveError(null); }}
                disabled={approving}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approving || !approveNote.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-green-500/20 border border-green-400/30 text-green-400 hover:bg-green-500/30 transition-all disabled:opacity-50"
              >
                {approving ? "Processing…" : "Approve & Execute"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Timeline Drawer */}
      {timelineTarget && (
        <DisputeTimeline
          disputeId={timelineTarget}
          onClose={() => setTimelineTarget(null)}
          profileMap={profileMap}
        />
      )}
    </div>
  );
}
