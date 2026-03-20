"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { getRoleBadge } from "@/lib/ui/roleBadge";
import { REFUND_REASONS, REFUND_REASON_LABELS, type RefundReason } from "@/lib/refundReasons";
import AdminConfirmModal from "@/components/AdminConfirmModal";

type Profile = {
  id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  account_status: string | null;
  status_reason: string | null;
  owed_balance: number | null;
  is_flagged: boolean | null;
  created_at: string;
  closed_at: string | null;
  role: string | null;
};

type Wallet = { balance: number };

type Transaction = {
  id: string;
  type: string;
  amount: number;
  reference_id: string | null;
  status: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type TipIntent = {
  receipt_id: string;
  tip_amount: number;
  refunded_amount: number;
  refund_status: string;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = ["active", "restricted", "suspended", "closed"] as const;
const ASSIGNABLE_ROLES = ["user", "support_admin", "finance_admin", "super_admin"] as const;

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tips, setTips] = useState<TipIntent[]>([]);
  const [disputeCount, setDisputeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [dangerAction, setDangerAction] = useState<string | null>(null);
  const [dangerInput, setDangerInput] = useState("");
  const [riskResult, setRiskResult] = useState<{ restricted: boolean; rules_fired: Array<{ rule: string; value: number; threshold: number }> } | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("user");
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [notes, setNotes] = useState<Array<{ id: string; note: string; created_at: string; admin: { display_name: string | null; handle: string | null; role: string | null } | null }>>([]);
  const [newNote, setNewNote] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [timeline, setTimeline] = useState<Array<{ type: string; label: string; created_at: string; role: string; actor: string; amount?: number; severity?: string }>>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [pendingRefunds, setPendingRefunds] = useState<Array<{ id: string; tip_intent_id: string; amount: number; required_approvals: number; requires_owner: boolean; created_at: string; votes: number; reason?: string; note?: string }>>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [approvalModal, setApprovalModal] = useState<{ refund: (typeof pendingRefunds)[number]; action: "approve" | "reject" } | null>(null);
  const [approvalRejectNote, setApprovalRejectNote] = useState("");
  const [allTips, setAllTips] = useState<Array<{ receipt_id: string; tip_amount: number; refunded_amount: number; refund_status: string; status: string; created_at: string }>>([]);
  const [refundModal, setRefundModal] = useState<{ tipId: string; tipAmount: number; refundedAmount: number } | null>(null);
  const [refundReason, setRefundReason] = useState<RefundReason>("user_request");
  const [refundNote, setRefundNote] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  useEffect(() => {
    loadUser();
    loadCurrentUserRole();
    loadNotes();
    loadTimeline();
    loadPendingRefunds();
    loadAllTips();
  }, [userId]);

  // Auto-refresh pending refunds every 5s
  useEffect(() => {
    const interval = setInterval(loadPendingRefunds, 5000);
    return () => clearInterval(interval);
  }, [tips]);

  async function loadCurrentUserRole() {
    const { data: sess } = await supabase.auth.getUser();
    if (!sess.user) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", sess.user.id)
      .single();
    setCurrentUserRole(p?.role ?? "user");
  }

  async function loadUser() {
    setLoading(true);

    const [profileRes, walletRes, txRes, tipsRes, disputeRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, user_id, handle, display_name, account_status, status_reason, owed_balance, is_flagged, created_at, closed_at, role")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("transactions_ledger")
        .select("id, type, amount, reference_id, status, meta, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("tip_intents")
        .select("receipt_id, tip_amount, refunded_amount, refund_status, status, created_at")
        .eq("creator_user_id", userId)
        .neq("refund_status", "none")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("tip_intents")
        .select("receipt_id", { count: "exact", head: true })
        .eq("creator_user_id", userId)
        .eq("status", "disputed"),
    ]);

    if (!profileRes.data) {
      setLoading(false);
      return;
    }

    setProfile(profileRes.data);
    setSelectedRole(profileRes.data.role ?? "user");
    setWallet(walletRes.data ?? { balance: 0 });
    setTransactions(txRes.data ?? []);
    setTips(tipsRes.data ?? []);
    setDisputeCount(disputeRes.count ?? 0);
    setLoading(false);
  }

  async function loadNotes() {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/admin/support-notes?user_id=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setNotes(json.notes ?? []);
    }
  }

  async function loadTimeline() {
    setTimelineLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { setTimelineLoading(false); return; }
    const res = await fetch(`/api/admin/user-timeline?user_id=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setTimeline(json.data ?? []);
    }
    setTimelineLoading(false);
  }

  async function loadPendingRefunds() {
    const { data: requests } = await supabase
      .from("refund_requests")
      .select("id, tip_intent_id, amount, required_approvals, requires_owner, created_at, reason, note")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!requests || requests.length === 0) { setPendingRefunds([]); return; }

    // Get vote counts for each request
    const withVotes = await Promise.all(
      requests.map(async (r: any) => {
        const { count } = await supabase
          .from("refund_approval_votes")
          .select("id", { count: "exact", head: true })
          .eq("refund_id", r.id);
        return { ...r, votes: count ?? 0 };
      })
    );

    // Filter to only show refunds related to this user's tips
    const userTipIds = tips.map(t => t.receipt_id);
    const filtered = withVotes.filter((r: any) => userTipIds.includes(r.tip_intent_id));
    setPendingRefunds(filtered);
  }

  async function loadAllTips() {
    const { data } = await supabase
      .from("tip_intents")
      .select("receipt_id, tip_amount, refunded_amount, refund_status, status, created_at")
      .eq("creator_user_id", userId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(50);
    setAllTips(data ?? []);
  }

  async function submitRefund() {
    if (!refundModal) return;
    setRefundSubmitting(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { setRefundSubmitting(false); return; }

    const maxRefundable = Number(refundModal.tipAmount) - Number(refundModal.refundedAmount);
    const res = await fetch("/api/admin/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tip_intent_id: refundModal.tipId,
        amount: maxRefundable,
        reason: refundReason,
        note: refundNote.trim() || undefined,
      }),
    });
    const json = await res.json();
    setRefundSubmitting(false);
    setRefundModal(null);
    setRefundNote("");
    setRefundReason("user_request");
    if (res.ok) {
      loadUser();
      loadAllTips();
      loadTimeline();
      loadPendingRefunds();
    } else {
      alert(json.error ?? "Refund failed");
    }
  }

  async function handleApprove(refundId: string) {
    setApproving(refundId);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { setApproving(null); return; }
    const res = await fetch("/api/admin/refund/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refund_id: refundId }),
    });
    const json = await res.json();
    setApproving(null);
    setApprovalModal(null);
    if (json.executed) {
      loadUser();
      loadTimeline();
    }
    loadPendingRefunds();
    if (!res.ok) alert(json.error ?? "Failed");
  }

  async function handleReject(refundId: string) {
    setApproving(refundId);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { setApproving(null); return; }
    await fetch("/api/admin/refund/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refund_id: refundId, reason: approvalRejectNote.trim() || undefined }),
    });
    setApproving(null);
    setApprovalModal(null);
    setApprovalRejectNote("");
    loadPendingRefunds();
    loadTimeline();
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setNoteSubmitting(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { setNoteSubmitting(false); return; }
    await fetch("/api/admin/support-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id: userId, note: newNote.trim() }),
    });
    setNewNote("");
    setNoteSubmitting(false);
    loadNotes();
  }

  async function updateStatus(status: string) {
    // Danger zone: require typed confirmation for destructive actions
    const isDangerous = status === "closed" || status === "suspended";
    if (isDangerous && dangerInput !== status.toUpperCase()) {
      setDangerAction(status);
      setDangerInput("");
      return;
    }

    setUpdating(true);
    setDangerAction(null);
    setDangerInput("");
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    await fetch("/api/admin/update-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: userId,
        status,
        ...(isDangerous ? { confirm_text: status.toUpperCase() } : {}),
      }),
    });

    setUpdating(false);
    loadUser();
  }

  async function runRiskEval() {
    setRiskLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/admin/risk-eval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id: userId }),
    });

    const json = await res.json();
    setRiskResult(json);
    setRiskLoading(false);
    if (json.restricted) loadUser();
  }

  function statusColor(s: string | null) {
    switch (s) {
      case "active": return "text-green-400";
      case "restricted": return "text-yellow-400";
      case "suspended": return "text-red-400";
      case "closed": case "closed_finalized": return "text-white/40";
      default: return ui.muted;
    }
  }

  function txTypeColor(t: string) {
    switch (t) {
      case "tip_received": return "text-green-400";
      case "tip_refunded": case "dispute": return "text-red-400";
      case "withdrawal": case "payout": return "text-orange-400";
      case "card_charge": return "text-blue-400";
      default: return ui.muted;
    }
  }

  const severity =
    disputeCount >= 3 ? "high" :
    disputeCount >= 1 ? "medium" :
    "low";

  if (loading) {
    return <p className={ui.muted}>Loading user…</p>;
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <p className="text-red-400 font-semibold">User not found</p>
        <Link href="/admin/users" className={ui.btnGhost}>← Back to users</Link>
      </div>
    );
  }

  const balance = Number(wallet?.balance ?? 0);
  const owed = Number(profile.owed_balance ?? 0);

  const isFlagged =
    (profile.account_status && profile.account_status !== "active") ||
    owed > 0 ||
    disputeCount >= 1 ||
    profile.is_flagged;

  return (
    <div className="space-y-6">
      {/* Sticky Risk Banner */}
      {isFlagged && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg leading-none">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">This account is high risk</p>
            <p className={`text-xs ${ui.muted} mt-0.5`}>
              {[
                profile.account_status !== "active" && `Status: ${profile.account_status}`,
                owed > 0 && `Owed balance: $${owed.toFixed(2)}`,
                disputeCount > 0 && `${disputeCount} dispute(s)`,
                profile.is_flagged && "Manually flagged",
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className={`${ui.btnGhost} ${ui.btnSmall}`}>←</Link>
        <h1 className={ui.h1}>
          {profile.display_name || profile.handle || "Unknown User"}
        </h1>
      </div>

      {/* Profile info + wallet */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${ui.card} p-5`}>
          <p className={`text-xs ${ui.muted2}`}>Account</p>
          <p className="font-medium mt-1">
            {profile.handle ? `@${profile.handle}` : "no handle"}
          </p>
          <p className={`text-xs ${ui.muted2}`}>ID: {profile.user_id}</p>
          <p className={`text-xs ${ui.muted2}`}>
            Joined: {new Date(profile.created_at).toLocaleDateString()}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-xs ${ui.muted2}`}>Role:</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getRoleBadge(profile.role).className}`}>
              {getRoleBadge(profile.role).label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-md ${
              profile.account_status === "active" ? "bg-green-500/10 text-green-400" :
              profile.account_status === "restricted" ? "bg-yellow-500/10 text-yellow-400" :
              profile.account_status === "suspended" ? "bg-orange-500/10 text-orange-400" :
              profile.account_status === "closed" || profile.account_status === "closed_finalized" ? "bg-white/5 text-white/40" :
              "bg-green-500/10 text-green-400"
            }`}>
              {profile.account_status ?? "active"}
            </span>
            {profile.status_reason && (
              <span className={`text-xs ${ui.muted2}`}>({profile.status_reason})</span>
            )}
          </div>
        </div>

        <div className={`${ui.card} p-5`}>
          <p className={`text-xs ${ui.muted2}`}>Balance</p>
          <p className={`text-2xl font-bold mt-1 ${balance < 0 ? "text-red-400" : "text-green-400"}`}>
            ${balance.toFixed(2)}
          </p>
          {owed > 0 && (
            <p className="text-sm text-red-400 font-semibold mt-1">Owed: ${owed.toFixed(2)}</p>
          )}
        </div>

        <div className={`${ui.card} p-5`}>
          <p className={`text-xs ${ui.muted2}`}>Risk</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-lg font-bold ${
              severity === "high" ? "text-red-400" :
              severity === "medium" ? "text-yellow-400" :
              "text-green-400"
            }`}>
              {severity.toUpperCase()}
            </span>
          </div>
          <p className={`text-xs ${ui.muted2} mt-1`}>{disputeCount} dispute(s)</p>
          {profile.is_flagged && (
            <p className="text-xs text-orange-400 font-semibold mt-1">⚑ Manually flagged</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className={`${ui.card} p-4`}>
        <p className="text-sm font-semibold mb-3">Actions</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.filter((s) => s !== profile.account_status).map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              disabled={updating}
              className={`${ui.btnGhost} ${ui.btnSmall} ${
                s === "suspended" || s === "closed"
                  ? "hover:bg-red-500/20 hover:border-red-400/30"
                  : s === "restricted"
                  ? "hover:bg-yellow-500/20 hover:border-yellow-400/30"
                  : "hover:bg-green-500/20 hover:border-green-400/30"
              }`}
            >
              {updating ? "…" : `Set ${s}`}
            </button>
          ))}
        </div>
      </div>

      {/* Role Assignment — owner only */}
      {currentUserRole === "owner" && (
        <div className={`${ui.card} p-4`}>
          <p className="text-sm font-semibold mb-3">Assign Role</p>
          <div className="flex items-center gap-3">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r} className="bg-zinc-900 text-white">
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <button
              disabled={roleUpdating || selectedRole === (profile.role ?? "user")}
              onClick={async () => {
                setRoleUpdating(true);
                const { data: sess } = await supabase.auth.getSession();
                const token = sess.session?.access_token;
                if (!token) { setRoleUpdating(false); return; }
                const res = await fetch("/api/admin/set-role", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    target_user_id: profile.id,
                    new_role: selectedRole,
                  }),
                });
                const json = await res.json();
                setRoleUpdating(false);
                if (json.ok) {
                  loadUser();
                } else {
                  alert(json.error ?? "Failed to update role");
                }
              }}
              className={`${ui.btnGhost} ${ui.btnSmall} hover:bg-blue-500/20 hover:border-blue-400/30 disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              {roleUpdating ? "Saving…" : "Save Role"}
            </button>
          </div>
          {profile.role === "owner" && (
            <p className="text-xs text-yellow-400 mt-2">This user is an owner — their role cannot be changed here.</p>
          )}
        </div>
      )}

      {/* Danger Zone Confirmation Modal */}
      {dangerAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[420px] space-y-4`}>
            <h2 className="text-lg font-semibold text-red-400">
              ⚠ Danger Zone
            </h2>
            <p className={`text-sm ${ui.muted}`}>
              You are about to <span className="text-white font-semibold">{dangerAction}</span> this account.
              This action is destructive and logged permanently.
            </p>
            <div>
              <p className="text-xs text-red-400 mb-2">
                Type <span className="font-bold">{dangerAction.toUpperCase()}</span> to confirm:
              </p>
              <input
                type="text"
                value={dangerInput}
                onChange={(e) => setDangerInput(e.target.value)}
                placeholder={dangerAction.toUpperCase()}
                className={`${ui.input} !py-2 !text-sm`}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setDangerAction(null); setDangerInput(""); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                Cancel
              </button>
              <button
                onClick={() => updateStatus(dangerAction)}
                disabled={dangerInput !== dangerAction.toUpperCase()}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-red-600 hover:bg-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                Confirm {dangerAction}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk Engine */}
      <div className={`${ui.card} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">Risk Engine</p>
          <button
            onClick={runRiskEval}
            disabled={riskLoading}
            className={`${ui.btnGhost} ${ui.btnSmall}`}
          >
            {riskLoading ? "Evaluating…" : "Run Risk Evaluation"}
          </button>
        </div>
        {riskResult && (
          <div className={`mt-2 text-sm ${riskResult.restricted ? "text-red-400" : "text-green-400"}`}>
            {riskResult.restricted ? (
              <div>
                <p className="font-semibold">Account auto-restricted</p>
                <ul className="mt-1 space-y-1">
                  {riskResult.rules_fired.map((r, i) => (
                    <li key={i} className={`text-xs ${ui.muted}`}>
                      {r.rule}: {r.value} (threshold: {r.threshold})
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>No risk rules triggered — account clear</p>
            )}
          </div>
        )}
      </div>

      {/* Pending Refund Approvals */}
      {pendingRefunds.length > 0 && (
        <div>
          <h2 className={`${ui.h2} mb-3`}>Pending Refund Approvals ({pendingRefunds.length})</h2>
          <div className="space-y-2">
            {pendingRefunds.map((r) => (
              <div key={r.id} className={`${ui.card} p-4 space-y-2`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      ${Number(r.amount).toFixed(2)} refund
                      {r.requires_owner && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          Owner required
                        </span>
                      )}
                    </p>
                    <p className={`text-xs ${ui.muted2}`}>
                      Tip: {r.tip_intent_id.slice(0, 8)}… · {new Date(r.created_at).toLocaleString()}
                    </p>
                    {r.reason && (
                      <p className="text-xs text-yellow-400 mt-1">
                        Reason: {REFUND_REASON_LABELS[r.reason as RefundReason] ?? r.reason}
                        {r.note && <span className={`ml-1 ${ui.muted2}`}>— {r.note}</span>}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-yellow-400">
                    {r.votes}/{r.required_approvals}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (r.votes / r.required_approvals) * 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setApprovalModal({ refund: r, action: "approve" })}
                      disabled={approving === r.id}
                      className={`${ui.btnGhost} ${ui.btnSmall} hover:bg-green-500/20 hover:border-green-400/30 disabled:opacity-30`}
                    >
                      {approving === r.id ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => setApprovalModal({ refund: r, action: "reject" })}
                      disabled={approving === r.id}
                      className={`${ui.btnGhost} ${ui.btnSmall} hover:bg-red-500/20 hover:border-red-400/30 disabled:opacity-30`}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval Confirmation Modal */}
      <AdminConfirmModal
        open={approvalModal !== null}
        title={approvalModal?.action === "approve" ? "Approve Refund" : "Reject Refund"}
        confirmLabel={approvalModal?.action === "approve" ? "Submit Approval" : "Reject Refund"}
        variant={approvalModal?.action === "approve" ? "approve" : "reject"}
        loading={approving !== null}
        onConfirm={() => {
          if (!approvalModal) return;
          if (approvalModal.action === "approve") handleApprove(approvalModal.refund.id);
          else handleReject(approvalModal.refund.id);
        }}
        onCancel={() => { setApprovalModal(null); setApprovalRejectNote(""); }}
      >
        {approvalModal && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className={ui.muted2}>Amount</span>
                <span className="font-semibold">${Number(approvalModal.refund.amount).toFixed(2)}</span>
              </div>
              {approvalModal.refund.reason && (
                <div className="flex justify-between">
                  <span className={ui.muted2}>Reason</span>
                  <span className="text-yellow-400">
                    {REFUND_REASON_LABELS[approvalModal.refund.reason as RefundReason] ?? approvalModal.refund.reason}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className={ui.muted2}>Approvals</span>
                <span className="font-semibold text-yellow-400">
                  {approvalModal.refund.votes}/{approvalModal.refund.required_approvals}
                </span>
              </div>
            </div>
            {approvalModal.action === "approve" && approvalModal.refund.votes + 1 >= approvalModal.refund.required_approvals && (
              <div className="bg-orange-500/10 border border-orange-400/20 rounded-lg p-3 text-xs text-orange-400 font-medium">
                ⚠ This approval will reach the required threshold — the refund will execute immediately.
              </div>
            )}
            {approvalModal.action === "approve" && approvalModal.refund.votes + 1 < approvalModal.refund.required_approvals && (
              <p className={`text-xs ${ui.muted2}`}>
                After your vote: {approvalModal.refund.votes + 1}/{approvalModal.refund.required_approvals} — refund will not execute yet.
              </p>
            )}
            {approvalModal.action === "reject" && (
              <div>
                <label className={`text-xs ${ui.muted2} block mb-1`}>Rejection note (optional)</label>
                <textarea
                  value={approvalRejectNote}
                  onChange={(e) => setApprovalRejectNote(e.target.value)}
                  placeholder="Why is this refund being rejected?"
                  rows={3}
                  className={`${ui.input} !py-2 !text-sm resize-none`}
                />
              </div>
            )}
          </>
        )}
      </AdminConfirmModal>

      {/* Tips — with refund trigger */}
      {allTips.length > 0 && (
        <div>
          <h2 className={`${ui.h2} mb-3`}>Tips ({allTips.length})</h2>
          <div className="space-y-2">
            {allTips.map((t) => {
              const tipAmt = Number(t.tip_amount);
              const refundedAmt = Number(t.refunded_amount ?? 0);
              const refundable = tipAmt - refundedAmt;
              const canRefund = t.refund_status !== "full" && t.refund_status !== "initiated" && refundable > 0;
              return (
                <div key={t.receipt_id} className={`${ui.card} p-3 flex items-center justify-between`}>
                  <div>
                    <p className="text-sm">
                      Tip {t.receipt_id.slice(0, 8)}… · ${tipAmt.toFixed(2)}
                      <span className={`ml-2 text-xs ${ui.muted2}`}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </p>
                    <p className={`text-xs ${ui.muted}`}>
                      Refunded: ${refundedAmt.toFixed(2)} · Status: {t.refund_status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${
                      t.refund_status === "full" ? "text-green-400" :
                      t.refund_status === "initiated" ? "text-orange-400" :
                      t.refund_status === "partial" ? "text-yellow-400" :
                      ui.muted2
                    }`}>
                      {t.refund_status === "none" ? "" : t.refund_status}
                    </span>
                    {canRefund && (
                      <button
                        onClick={() => setRefundModal({ tipId: t.receipt_id, tipAmount: tipAmt, refundedAmount: refundedAmt })}
                        className={`${ui.btnGhost} ${ui.btnSmall} hover:bg-orange-500/20 hover:border-orange-400/30`}
                      >
                        Refund
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[440px] space-y-4`}>
            <h2 className="text-lg font-semibold text-orange-400">
              Issue Refund
            </h2>
            <p className={`text-sm ${ui.muted}`}>
              Tip {refundModal.tipId.slice(0, 8)}… — Refundable: <span className="text-white font-semibold">${(refundModal.tipAmount - refundModal.refundedAmount).toFixed(2)}</span>
            </p>
            <div>
              <label className={`text-xs ${ui.muted2} block mb-1`}>Reason *</label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value as RefundReason)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer"
              >
                {REFUND_REASONS.map((r) => (
                  <option key={r} value={r} className="bg-zinc-900 text-white">{REFUND_REASON_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`text-xs ${ui.muted2} block mb-1`}>Note (optional)</label>
              <textarea
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                placeholder="Additional context…"
                rows={3}
                className={`${ui.input} !py-2 !text-sm resize-none w-full`}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setRefundModal(null); setRefundNote(""); setRefundReason("user_request"); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                Cancel
              </button>
              <button
                onClick={submitRefund}
                disabled={refundSubmitting}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-500 transition disabled:opacity-50`}
              >
                {refundSubmitting ? "Processing…" : "Submit Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div>
        <h2 className={`${ui.h2} mb-3`}>Transaction History ({transactions.length})</h2>
        {transactions.length === 0 ? (
          <p className={ui.muted}>No transactions.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className={`${ui.card} p-3 flex items-center justify-between`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${txTypeColor(tx.type)}`}>
                      {tx.type.replace(/_/g, " ")}
                    </span>
                    <span className={`text-xs ${ui.muted2}`}>
                      {new Date(tx.created_at).toLocaleString()}
                    </span>
                  </div>
                  {tx.reference_id && (
                    <p className={`text-xs ${ui.muted2}`}>Ref: {tx.reference_id.slice(0, 12)}…</p>
                  )}
                </div>
                <p className={`font-bold ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {tx.amount >= 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      <div>
        <h2 className={`${ui.h2} mb-3`}>Activity Timeline ({timeline.length})</h2>
        {timelineLoading ? (
          <p className={ui.muted}>Loading timeline…</p>
        ) : timeline.length === 0 ? (
          <p className={ui.muted}>No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((t, i) => {
              const badge = getRoleBadge(t.role);
              const typeIcon = t.type === "note" ? "📝" : t.type === "admin" ? "🛡️" : "💰";
              return (
                <div key={i} className={`${ui.card} p-3`}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm leading-none">{typeIcon}</span>
                    <span className={`text-xs ${ui.muted2}`}>{t.actor}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className={`text-xs ${ui.muted2}`}>
                      {new Date(t.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{t.label}</p>
                  {t.type === "transaction" && t.amount != null && (
                    <p className={`text-xs font-semibold mt-0.5 ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.amount >= 0 ? "+" : ""}${Math.abs(t.amount).toFixed(2)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Support Notes */}
      <div>
        <h2 className={`${ui.h2} mb-3`}>Support Notes ({notes.length})</h2>

        {/* Add note form — owner, super_admin, support_admin */}
        {currentUserRole && ["owner", "super_admin", "support_admin"].includes(currentUserRole) && (
          <div className={`${ui.card} p-4 mb-4`}>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add internal note…"
              rows={3}
              className={`${ui.input} !py-2 !text-sm resize-none w-full`}
            />
            <button
              onClick={addNote}
              disabled={noteSubmitting || !newNote.trim()}
              className={`${ui.btnGhost} ${ui.btnSmall} mt-2 hover:bg-blue-500/20 hover:border-blue-400/30 disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              {noteSubmitting ? "Saving…" : "Add Note"}
            </button>
          </div>
        )}

        {notes.length === 0 ? (
          <p className={ui.muted}>No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => {
              const badge = getRoleBadge(n.admin?.role);
              const adminName = n.admin?.display_name || n.admin?.handle || "Admin";
              return (
                <div key={n.id} className={`${ui.card} p-3`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs ${ui.muted2}`}>{adminName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className={`text-xs ${ui.muted2}`}>
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{n.note}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
