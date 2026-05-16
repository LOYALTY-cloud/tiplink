"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import { getRoleBadge } from "@/lib/ui/roleBadge";
import { REFUND_REASONS, REFUND_REASON_LABELS, type RefundReason } from "@/lib/refundReasons";
import AdminConfirmModal from "@/components/AdminConfirmModal";
import AdminRiskCard from "@/components/AdminRiskCard";
import ActivityCalendar from "@/components/admin/ActivityCalendar";
import { getAdminWarnings } from "@/lib/adminWarnings";
import { stripeFieldLabel } from "@/lib/stripe/fieldLabels";

type Profile = {
  id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  account_status: string | null;
  status_reason: string | null;
  owed_balance: number | null;
  is_flagged: boolean | null;
  created_at: string;
  closed_at: string | null;
  role: string | null;
  trust_score: number | null;
  risk_level: string | null;
  last_risk_check: string | null;
  is_frozen: boolean | null;
  freeze_reason: string | null;
  // Stripe
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  restriction_level: string | null;
  stripe_verification_status: string | null;
  stripe_disabled_reason: string | null;
  stripe_last_synced_at: string | null;
  stripe_requirements_due_count: number | null;
  stripe_past_requirements_due_count: number | null;
  stripe_currently_due: string[] | null;
  stripe_past_due: string[] | null;
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

export default function AdminUserDetailPage() {
  const params = useParams();
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
  const [actionReason, setActionReason] = useState("");
  const [restrictedUntil, setRestrictedUntil] = useState("");
  const [riskResult, setRiskResult] = useState<{ restricted: boolean; rules_fired: Array<{ rule: string; value: number; threshold: number }> } | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

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

  const [supportHistory, setSupportHistory] = useState<Array<{ id: string; ticket_id: string; issue_type: string; summary: string; resolution: string; outcome: string; created_at: string }>>([]);

  const [exporting, setExporting] = useState(false);
  const [syncingStripe, setSyncingStripe] = useState(false);

  async function syncStripe() {
    setSyncingStripe(true);
    try {
      const headers = getAdminHeaders();
      await fetch("/api/admin/stripe-sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      await loadUser();
    } catch (e) {
      console.error("stripe sync failed", e);
    } finally {
      setSyncingStripe(false);
    }
  }

  // Override system state
  const [overrideModal, setOverrideModal] = useState<{ type: string; label: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [finTab, setFinTab] = useState<"transactions" | "tips">("transactions");

  async function submitOverride() {
    if (!overrideModal || overrideReason.trim().length < 5) return;
    setOverrideSubmitting(true);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setOverrideSubmitting(false); return; }

    try {
      const res = await fetch("/api/admin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          userId,
          overrideType: overrideModal.type,
          reason: overrideReason.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setOverrideMessage(`Override applied: ${overrideModal.label}`);
        setOverrideModal(null);
        setOverrideReason("");
        loadUser();
        loadTimeline();
      } else {
        setOverrideMessage(`Error: ${json.error}`);
      }
    } catch {
      setOverrideMessage("Error: Network request failed");
    } finally {
      setOverrideSubmitting(false);
      setTimeout(() => setOverrideMessage(null), 5000);
    }
  }

  useEffect(() => {
    loadUser();
    loadCurrentUserRole();
    loadNotes();
    loadTimeline();
    loadPendingRefunds();
    loadAllTips();
    loadSupportHistory();
  }, [userId]);

  // Auto-refresh pending refunds every 5s
  useEffect(() => {
    const interval = setInterval(loadPendingRefunds, 5000);
    return () => clearInterval(interval);
  }, [tips]);

  async function loadCurrentUserRole() {
    const session = getAdminSession();
    if (!session) return;
    setCurrentUserRole(session.role ?? "user");
  }

  async function loadSupportHistory() {
    const { data } = await supabase
      .from("user_support_history")
      .select("id, ticket_id, issue_type, summary, resolution, outcome, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setSupportHistory(data ?? []);
  }

  async function loadUser() {
    setLoading(true);

    const headers = getAdminHeaders();

    // profiles is publicly readable — safe to query directly
    const profileRes = await supabase
      .from("profiles")
      .select("id, user_id, handle, display_name, email, first_name, last_name, account_status, status_reason, owed_balance, is_flagged, created_at, closed_at, role, trust_score, risk_level, last_risk_check, is_frozen, freeze_reason, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, restriction_level, stripe_verification_status, stripe_disabled_reason, stripe_last_synced_at, stripe_requirements_due_count, stripe_past_requirements_due_count, stripe_currently_due, stripe_past_due")
      .eq("user_id", userId)
      .maybeSingle();

    // wallets and tip_intents have admin-only RLS; fetch via service-role API
    let statsWallet: Wallet = { balance: 0 };
    let statsTips: TipIntent[] = [];
    let statsDisputeCount = 0;
    let txData: Transaction[] = [];

    const [statsRes, txRes] = await Promise.all([
      fetch(`/api/admin/users/${userId}/stats`, { headers }),
      fetch(`/api/admin/users/${userId}/transactions`, { headers }),
    ]);

    if (statsRes.ok) {
      const statsJson = await statsRes.json();
      statsWallet = statsJson.wallet ?? { balance: 0 };
      statsTips = statsJson.tips ?? [];
      statsDisputeCount = statsJson.disputeCount ?? 0;
    }

    if (txRes.ok) {
      const txJson = await txRes.json();
      txData = txJson.transactions ?? [];
    }

    if (!profileRes.data) {
      setLoading(false);
      return;
    }

    setProfile(profileRes.data);
    setWallet(statsWallet);
    setTransactions(txData);
    setTips(statsTips);
    setDisputeCount(statsDisputeCount);
    setLoading(false);
  }

  async function loadNotes() {
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;
    const res = await fetch(`/api/admin/support-notes?user_id=${userId}`, {
      headers,
    });
    if (res.ok) {
      const json = await res.json();
      setNotes(json.notes ?? []);
    }
  }

  async function loadTimeline() {
    setTimelineLoading(true);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setTimelineLoading(false); return; }
    const res = await fetch(`/api/admin/user-timeline?user_id=${userId}`, {
      headers,
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
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setRefundSubmitting(false); return; }

    const maxRefundable = Number(refundModal.tipAmount) - Number(refundModal.refundedAmount);
    const res = await fetch("/api/admin/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
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
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setApproving(null); return; }
    const res = await fetch("/api/admin/refund/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
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
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setApproving(null); return; }
    await fetch("/api/admin/refund/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
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
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) { setNoteSubmitting(false); return; }
    await fetch("/api/admin/support-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ user_id: userId, note: newNote.trim() }),
    });
    setNewNote("");
    setNoteSubmitting(false);
    loadNotes();
  }

  async function updateStatus(status: string) {
    // Danger zone or restricted: show modal for reason entry
    const isDangerous = status === "closed" || status === "suspended";
    const needsReason = isDangerous || status === "restricted";
    if (needsReason && !dangerAction) {
      setDangerAction(status);
      setDangerInput("");
      setActionReason("");
      setRestrictedUntil("");
      return;
    }
    if (isDangerous && dangerInput !== status.toUpperCase()) return;
    if (needsReason && !actionReason.trim()) return;

    setUpdating(true);
    setDangerAction(null);
    setDangerInput("");
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;

    await fetch("/api/admin/update-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        user_id: userId,
        status,
        reason: actionReason.trim() || undefined,
        ...(isDangerous ? { confirm_text: status.toUpperCase() } : {}),
        ...(status === "restricted" && restrictedUntil ? { restricted_until: restrictedUntil } : {}),
      }),
    });

    setActionReason("");
    setRestrictedUntil("");
    setUpdating(false);
    loadUser();
  }

  async function runRiskEval() {
    setRiskLoading(true);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;

    const res = await fetch("/api/admin/risk-eval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
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

  async function exportCase() {
    if (!profile) return;
    setExporting(true);
    try {
      const bal = Number(wallet?.balance ?? 0);
      const ow = Number(profile.owed_balance ?? 0);
      const sev = disputeCount >= 3 ? "high" : disputeCount >= 1 ? "medium" : "low";

      const caseData = {
        userId: profile.user_id,
        handle: profile.handle,
        displayName: profile.display_name,
        email: profile.email,
        accountStatus: profile.account_status,
        statusReason: profile.status_reason,
        createdAt: profile.created_at,
        balance: bal,
        owedBalance: ow,
        isFlagged: !!profile.is_flagged,
        disputeCount,
        riskLevel: sev,
        timeline: timeline.map((t) => ({ action: t.label, created_at: t.created_at, actor: t.actor, severity: t.severity })),
        transactions: transactions.map((tx) => ({ type: tx.type, amount: tx.amount, created_at: tx.created_at, reference_id: tx.reference_id })),
        supportHistory,
        notes: notes.map((n) => ({ note: n.note, created_at: n.created_at, admin: n.admin })),
      };

      const res = await fetch("/api/admin/export-case", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ caseData }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `case-report-${profile.handle || profile.user_id.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export case PDF");
    } finally {
      setExporting(false);
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
    profile.is_flagged ||
    profile.is_frozen;


  return (
    <div className="space-y-6">
      {/* ═══════════ STICKY HEADER ═══════════ */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-black/40 border-b border-white/10 -mx-4 px-4 py-3 flex items-center gap-4">
        <Link href="/admin/users" className={`${ui.btnGhost} ${ui.btnSmall}`}>←</Link>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Case File</p>
          <h1 className="text-lg font-semibold truncate">
            {profile.display_name || profile.handle || "Unknown User"}
            {profile.handle && <span className="ml-2 text-sm text-white/30">@{profile.handle}</span>}
          </h1>
        </div>

        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
          profile.account_status === "active" ? "bg-green-500/10 text-green-400" :
          profile.account_status === "restricted" ? "bg-yellow-500/10 text-yellow-400" :
          profile.account_status === "suspended" ? "bg-red-500/10 text-red-400" :
          "bg-white/5 text-white/40"
        }`}>
          {profile.account_status ?? "active"}
        </span>

        <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
          severity === "high" ? "bg-red-500/20 text-red-400" :
          severity === "medium" ? "bg-yellow-500/20 text-yellow-400" :
          "bg-green-500/20 text-green-400"
        }`}>
          {severity.toUpperCase()} RISK
        </span>

        {currentUserRole === "owner" && (
          <button onClick={exportCase} disabled={exporting} className={`${ui.btnGhost} ${ui.btnSmall}`}>
            {exporting ? "…" : "Export"}
          </button>
        )}
      </div>

      {/* ═══════════ RISK BANNER ═══════════ */}
      {isFlagged && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 flex items-start gap-3 shadow-[0_0_30px_rgba(239,68,68,0.05)]">
          <span className="text-red-400 text-lg leading-none">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">This account is high risk</p>
            <p className={`text-xs ${ui.muted} mt-0.5`}>
              {[
                profile.account_status !== "active" && `Status: ${profile.account_status}`,
                owed > 0 && `Owed balance: $${owed.toFixed(2)}`,
                disputeCount > 0 && `${disputeCount} dispute(s)`,
                profile.is_flagged && "Manually flagged",
                profile.is_frozen && `Frozen: ${profile.freeze_reason ?? "suspicious activity"}`,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════ CASE STATUS STRIP ═══════════ */}
      <div className="flex gap-3 flex-wrap">
        <CaseBadge label="Disputes" value={disputeCount} color={disputeCount > 0 ? "red" : undefined} />
        <CaseBadge label="Refunds" value={tips.length} color={tips.length > 0 ? "yellow" : undefined} />
        <CaseBadge label="Balance" value={`$${balance.toFixed(2)}`} color={balance < 0 ? "red" : undefined} />
        <CaseBadge label="Owed" value={`$${owed.toFixed(2)}`} color={owed > 0 ? "red" : undefined} />
        <CaseBadge label="Trust" value={profile.trust_score ?? "—"} color={
          (profile.trust_score ?? 100) < 40 ? "red" : (profile.trust_score ?? 100) < 70 ? "yellow" : undefined
        } />
        <CaseBadge label="Joined" value={new Date(profile.created_at).toLocaleDateString()} />
      </div>

      {/* ═══════════ 2-COLUMN LAYOUT ═══════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">

        {/* ────── LEFT: DATA COLUMN ────── */}
        <div className="space-y-6">

          {/* PROFILE + BALANCE + RISK CARDS */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className={`${ui.card} p-5 bg-gradient-to-br from-white/[.04] to-transparent hover:scale-[1.01] transition-all duration-300`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Account</p>
              <p className="font-medium">{profile.handle ? `@${profile.handle}` : "no handle"}</p>
              <p className={`text-xs ${ui.muted2} mt-1`}>ID: {profile.user_id.slice(0, 16)}…</p>
              <p className={`text-xs ${ui.muted2}`}>Joined: {new Date(profile.created_at).toLocaleDateString()}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getRoleBadge(profile.role).className}`}>
                  {getRoleBadge(profile.role).label}
                </span>
              </div>
              {profile.status_reason && (
                <p className={`text-xs ${ui.muted2} mt-1`}>Reason: {profile.status_reason}</p>
              )}
            </div>

            <div className={`${ui.card} p-5 bg-gradient-to-br from-white/[.04] to-transparent hover:scale-[1.01] transition-all duration-300`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Balance</p>
              <p className={`text-2xl font-bold mt-1 ${balance < 0 ? "text-red-400" : "text-green-400"}`}>
                ${balance.toFixed(2)}
              </p>
              {owed > 0 && (
                <p className="text-sm text-red-400 font-semibold mt-1">Owed: ${owed.toFixed(2)}</p>
              )}
            </div>

            <div className={`${ui.card} p-5 bg-gradient-to-br from-white/[.04] to-transparent hover:scale-[1.01] transition-all duration-300`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Risk</p>
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
              {profile.is_frozen && (
                <p className="text-xs text-red-400 font-semibold mt-1">❄ Frozen</p>
              )}
            </div>
          </div>

          {/* STRIPE TRUST & RISK PROFILE */}
          {profile.stripe_account_id ? (
            <div className={`${ui.card} p-5 space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Stripe Trust & Risk Profile</p>
                <div className="flex items-center gap-3">
                  {profile.stripe_last_synced_at && (
                    <span className="text-[10px] text-white/25">
                      synced {Math.round((Date.now() - new Date(profile.stripe_last_synced_at).getTime()) / 60000)}m ago
                    </span>
                  )}
                  <button
                    onClick={syncStripe}
                    disabled={syncingStripe}
                    className={`text-[10px] px-2 py-1 rounded border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition disabled:opacity-40`}
                  >
                    {syncingStripe ? "Syncing…" : "↻ Sync"}
                  </button>
                </div>
              </div>

              {/* Status pills */}
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  profile.stripe_charges_enabled ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                }`}>
                  {profile.stripe_charges_enabled ? "✓ Charges" : "✗ Charges"}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  profile.stripe_payouts_enabled ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                }`}>
                  {profile.stripe_payouts_enabled ? "✓ Payouts" : "✗ Payouts"}
                </span>
                {(profile.restriction_level === "high_risk" || profile.restriction_level === "restricted") && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-red-500/10 text-red-400">
                    ⚠ {profile.restriction_level === "high_risk" ? "High Risk" : "Restricted"}
                  </span>
                )}
                {profile.restriction_level === "warning" && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-orange-500/10 text-orange-400">
                    ⚠ Warning
                  </span>
                )}
                {profile.stripe_verification_status && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-white/5 text-white/50">
                    🔓 {profile.stripe_verification_status}
                  </span>
                )}
              </div>

              {profile.stripe_disabled_reason && (
                <p className="text-xs text-red-300/70">Disabled: {profile.stripe_disabled_reason.replace(/_/g, " ")}</p>
              )}

              {/* Requirements breakdown — collapsible */}
              {((profile.stripe_requirements_due_count ?? 0) > 0 || (profile.stripe_past_requirements_due_count ?? 0) > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(profile.stripe_requirements_due_count ?? 0) > 0 && (
                    <details className="group rounded-lg border border-yellow-400/15 bg-yellow-400/5 overflow-hidden">
                      <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none list-none">
                        <span className="text-[11px] font-semibold text-yellow-300">
                          Currently Due — {profile.stripe_requirements_due_count} item{profile.stripe_requirements_due_count !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[10px] text-white/30 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="px-3 pb-3 flex flex-col gap-1 border-t border-yellow-400/10 pt-2">
                        {(profile.stripe_currently_due && profile.stripe_currently_due.length > 0
                          ? profile.stripe_currently_due
                          : Array(profile.stripe_requirements_due_count).fill(null)
                        ).map((item: string | null, i: number) => (
                          <span key={i} className="text-[11px] text-yellow-200/70 font-mono break-all">
                            · {item ? stripeFieldLabel(item) : "—"}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                  {(profile.stripe_past_requirements_due_count ?? 0) > 0 && (
                    <details className="group rounded-lg border border-red-400/15 bg-red-400/5 overflow-hidden">
                      <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none list-none">
                        <span className="text-[11px] font-semibold text-red-300">
                          Past Due — {profile.stripe_past_requirements_due_count} item{profile.stripe_past_requirements_due_count !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[10px] text-white/30 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="px-3 pb-3 flex flex-col gap-1 border-t border-red-400/10 pt-2">
                        {(profile.stripe_past_due && profile.stripe_past_due.length > 0
                          ? profile.stripe_past_due
                          : Array(profile.stripe_past_requirements_due_count).fill(null)
                        ).map((item: string | null, i: number) => (
                          <span key={i} className="text-[11px] text-red-200/70 font-mono break-all">
                            · {item ? stripeFieldLabel(item) : "—"}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {(profile.stripe_requirements_due_count ?? 0) === 0 && (profile.stripe_past_requirements_due_count ?? 0) === 0 && (
                <p className="text-xs text-green-400/70">✓ No outstanding requirements</p>
              )}
            </div>
          ) : (
            <div className={`${ui.card} p-4`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Stripe Trust & Risk Profile</p>
              <p className="text-xs text-white/25">No Stripe account connected</p>
            </div>
          )}

          {/* TRUST SCORE & RISK CARD */}
          {profile.trust_score != null && (
            <div className="shadow-[0_0_30px_rgba(255,255,255,0.02)]">
              <AdminRiskCard
                trust_score={profile.trust_score}
                risk_level={profile.risk_level ?? "medium"}
                last_risk_check={profile.last_risk_check}
                is_frozen={!!profile.is_frozen}
                freeze_reason={profile.freeze_reason}
                is_flagged={!!profile.is_flagged}
              />
            </div>
          )}

          {/* FINANCIAL ACTIVITY (TABBED) */}
          <div className={`${ui.card} p-4 shadow-[0_0_40px_rgba(0,0,0,0.3)]`}>
            <div className="flex items-center gap-1 mb-4">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mr-auto">Financial Activity</p>
              <button
                onClick={() => setFinTab("transactions")}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  finTab === "transactions" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                }`}
              >
                Transactions ({transactions.length})
              </button>
              <button
                onClick={() => setFinTab("tips")}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  finTab === "tips" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                }`}
              >
                Tips ({allTips.length})
              </button>
            </div>

            {finTab === "transactions" && (
              transactions.length === 0 ? (
                <p className={ui.muted}>No transactions.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[.02] hover:bg-white/[.04] transition">
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
              )
            )}

            {finTab === "tips" && (
              allTips.length === 0 ? (
                <p className={ui.muted}>No tips.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {allTips.map((t) => {
                    const tipAmt = Number(t.tip_amount);
                    const refundedAmt = Number(t.refunded_amount ?? 0);
                    const refundable = tipAmt - refundedAmt;
                    const canRefund = t.refund_status !== "full" && t.refund_status !== "initiated" && refundable > 0;
                    return (
                      <div key={t.receipt_id} className="flex items-center justify-between p-3 rounded-lg bg-white/[.02] hover:bg-white/[.04] transition">
                        <div>
                          <p className="text-sm">
                            {t.receipt_id.slice(0, 8)}… · ${tipAmt.toFixed(2)}
                            <span className={`ml-2 text-xs ${ui.muted2}`}>
                              {new Date(t.created_at).toLocaleDateString()}
                            </span>
                          </p>
                          <p className={`text-xs ${ui.muted}`}>
                            Refunded: ${refundedAmt.toFixed(2)} · {t.refund_status}
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
              )
            )}
          </div>

          {/* ACTIVITY TIMELINE */}
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Activity Timeline ({timeline.length})</p>
            {timelineLoading ? (
              <p className={ui.muted}>Loading timeline…</p>
            ) : timeline.length === 0 ? (
              <p className={ui.muted}>No activity yet.</p>
            ) : (
              <div className="relative pl-4 border-l border-white/10 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {timeline.map((t, i) => {
                  const badge = getRoleBadge(t.role);
                  const typeIcon = t.type === "note" ? "📝" : t.type === "admin" ? "🛡️" : "💰";
                  return (
                    <div key={i} className="relative pl-4">
                      <span className={`absolute -left-[9px] top-2 w-2 h-2 rounded-full ${
                        t.severity === "high" ? "bg-red-400" :
                        t.severity === "medium" ? "bg-yellow-400" :
                        "bg-white/30"
                      }`} />
                      <div className="p-3 rounded-lg bg-white/[.02] hover:bg-white/[.04] transition">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm leading-none">{typeIcon}</span>
                          <span className={`text-xs ${ui.muted2}`}>{t.actor}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className={`text-xs ${ui.muted2} ml-auto`}>
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ACTIVITY CALENDAR — owner only */}
          {currentUserRole === "owner" && profile && (
            <div>
              <ActivityCalendar userId={userId} signedUpAt={profile.created_at} />
            </div>
          )}

          {/* CASE NOTES (MERGED SUPPORT HISTORY + NOTES) */}
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Case Notes</p>

            {/* Support History */}
            {supportHistory.length > 0 && (
              <div className="space-y-2 mb-4">
                {supportHistory.map((h) => (
                  <div key={h.id} className={`${ui.card} p-4 space-y-1.5 hover:scale-[1.01] transition-all duration-300`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          h.outcome === "resolved"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {h.outcome === "resolved" ? "✅ Resolved" : "⚠️ Open"}
                        </span>
                        <span className={`text-xs ${ui.muted2} capitalize`}>
                          {h.issue_type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className={`text-xs ${ui.muted2}`}>
                        {new Date(h.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{h.summary}</p>
                    <p className={`text-xs ${ui.muted}`}>{h.resolution}</p>
                    <a href={`/admin/tickets/${h.ticket_id}`} className="text-xs text-blue-400 hover:text-blue-300 transition">
                      View ticket →
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Add note form */}
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

            {notes.length === 0 && supportHistory.length === 0 ? (
              <p className={ui.muted}>No notes yet.</p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => {
                  const badge = getRoleBadge(n.admin?.role);
                  const adminName = n.admin?.display_name || n.admin?.handle || "Admin";
                  return (
                    <div key={n.id} className="p-3 rounded-lg bg-white/[.02] hover:bg-white/[.04] transition">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs ${ui.muted2}`}>{adminName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className={`text-xs ${ui.muted2} ml-auto`}>
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
        {/* ────── END LEFT COLUMN ────── */}

        {/* ────── RIGHT: ACTION RAIL ────── */}
        <div className="space-y-4">

          {/* QUICK ACTIONS */}
          <div className={`${ui.card} p-4 shadow-[0_0_40px_rgba(0,0,0,0.3)]`}>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Quick Actions</p>
            <div className="flex flex-col gap-2">
              {STATUS_OPTIONS.filter((s) => s !== profile.account_status).map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  disabled={updating}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition text-sm ${
                    s === "suspended" || s === "closed"
                      ? "border-red-400/20 text-red-400 hover:bg-red-500/10"
                      : s === "restricted"
                      ? "border-yellow-400/20 text-yellow-400 hover:bg-yellow-500/10"
                      : "border-green-400/20 text-green-400 hover:bg-green-500/10"
                  }`}
                >
                  {updating ? "…" : `Set ${s}`}
                </button>
              ))}
            </div>
          </div>

          {/* ADMIN OVERRIDES */}
          {(currentUserRole === "owner" || currentUserRole === "super_admin" || currentUserRole === "finance_admin") && (
            <div className={`${ui.card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Overrides</p>
                <Link href="/admin/overrides" className={`text-xs ${ui.muted2} hover:text-white transition`}>
                  Audit log →
                </Link>
              </div>

              {overrideMessage && (
                <div className={`text-xs px-3 py-2 rounded-lg mb-3 ${overrideMessage.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                  {overrideMessage}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {profile.is_flagged && (
                  <button onClick={() => setOverrideModal({ type: "unflag", label: "Unflag User" })}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-green-400/20 text-green-400 hover:bg-green-500/10 transition text-sm">
                    Unflag User
                  </button>
                )}
                {!profile.is_flagged && (
                  <button onClick={() => setOverrideModal({ type: "manual_flag", label: "Manual Flag" })}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-orange-400/20 text-orange-400 hover:bg-orange-500/10 transition text-sm">
                    Manual Flag
                  </button>
                )}
                {profile.account_status === "restricted" && (
                  <button onClick={() => setOverrideModal({ type: "clear_restriction", label: "Clear Restriction" })}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-green-400/20 text-green-400 hover:bg-green-500/10 transition text-sm">
                    Clear Restriction
                  </button>
                )}
                <button onClick={() => setOverrideModal({ type: "bypass_verification", label: "Bypass Verification" })}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-amber-400/20 text-amber-400 hover:bg-amber-500/10 transition text-sm">
                  Bypass Verification
                </button>
                <button onClick={() => setOverrideModal({ type: "override_risk_score", label: "Reset Risk Score" })}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-blue-400/20 text-blue-400 hover:bg-blue-500/10 transition text-sm">
                  Reset Risk Score
                </button>
                <button onClick={() => setOverrideModal({ type: "unlock_withdrawal", label: "Unlock Withdrawal" })}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-amber-400/20 text-amber-400 hover:bg-amber-500/10 transition text-sm">
                  Unlock Withdrawal
                </button>
                {currentUserRole === "owner" && (
                  <button onClick={() => setOverrideModal({ type: "override_withdrawal_limit", label: "Remove Withdrawal Limit" })}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-red-400/20 text-red-400 hover:bg-red-500/10 transition text-sm">
                    Remove Withdrawal Limit
                  </button>
                )}
              </div>
            </div>
          )}

          {/* RISK ENGINE */}
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Risk Engine</p>
              <button onClick={runRiskEval} disabled={riskLoading} className={`${ui.btnGhost} ${ui.btnSmall}`}>
                {riskLoading ? "…" : "Run"}
              </button>
            </div>
            {riskResult && (
              <div className={`mt-2 text-sm ${riskResult.restricted ? "text-red-400" : "text-green-400"}`}>
                {riskResult.restricted ? (
                  <div>
                    <p className="font-semibold text-xs">Auto-restricted</p>
                    <ul className="mt-1 space-y-1">
                      {riskResult.rules_fired.map((r, i) => (
                        <li key={i} className={`text-xs ${ui.muted}`}>
                          {r.rule}: {r.value} (threshold: {r.threshold})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs">No rules triggered — clear</p>
                )}
              </div>
            )}
          </div>

          {/* PENDING REFUND APPROVALS */}
          {pendingRefunds.length > 0 && (
            <div className={`${ui.card} p-4`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">
                Pending Refunds ({pendingRefunds.length})
              </p>
              <div className="space-y-3">
                {pendingRefunds.map((r) => (
                  <div key={r.id} className="space-y-2 p-3 rounded-lg bg-white/[.02]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          ${Number(r.amount).toFixed(2)}
                          {r.requires_owner && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                              Owner
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${ui.muted2}`}>{r.tip_intent_id.slice(0, 8)}…</p>
                        {r.reason && (
                          <p className="text-xs text-yellow-400 mt-0.5">
                            {REFUND_REASON_LABELS[r.reason as RefundReason] ?? r.reason}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-bold text-yellow-400">{r.votes}/{r.required_approvals}</span>
                    </div>
                    <div className="bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (r.votes / r.required_approvals) * 100)}%` }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setApprovalModal({ refund: r, action: "approve" })} disabled={approving === r.id}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-green-400/20 text-green-400 hover:bg-green-500/10 transition disabled:opacity-30">
                        {approving === r.id ? "…" : "Approve"}
                      </button>
                      <button onClick={() => setApprovalModal({ refund: r, action: "reject" })} disabled={approving === r.id}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-red-400/20 text-red-400 hover:bg-red-500/10 transition disabled:opacity-30">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        {/* ────── END RIGHT COLUMN ────── */}

      </div>
      {/* ────── END 2-COLUMN LAYOUT ────── */}

      {/* ═══════════ MODALS (UNCHANGED LOGIC) ═══════════ */}

      {/* Danger Zone Confirmation Modal */}
      {dangerAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[420px] space-y-4 shadow-[0_0_40px_rgba(0,0,0,0.5)]`}>
            <h2 className={`text-lg font-semibold ${
              dangerAction === "restricted" ? "text-yellow-400" : "text-red-400"
            }`}>
              {dangerAction === "restricted" ? "⚠ Restrict Account" : "⚠ Danger Zone"}
            </h2>
            <p className={`text-sm ${ui.muted}`}>
              You are about to <span className="text-white font-semibold">{dangerAction}</span> this account.
              This action is logged permanently.
            </p>

            {(() => {
              const warnings = getAdminWarnings({
                risk_level: severity,
                dispute_count: disputeCount,
                account_status: profile?.account_status ?? undefined,
                is_flagged: profile?.is_flagged ?? false,
                owed_balance: profile?.owed_balance ?? 0,
                action: dangerAction,
              });
              if (warnings.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  {warnings.map((w, i) => (
                    <div key={i} className={`text-xs px-3 py-2 rounded-lg border ${
                      w.level === "high" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                      w.level === "medium" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                      "bg-blue-500/10 border-blue-500/20 text-blue-400"
                    }`}>
                      {w.level === "high" ? "🔴" : w.level === "medium" ? "🟡" : "🔵"} {w.message}
                    </div>
                  ))}
                </div>
              );
            })()}

            <div>
              <p className="text-xs text-gray-400 mb-2">Reason (required):</p>
              <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)}
                placeholder="Why are you taking this action?" rows={2}
                className={`${ui.input} !py-2 !text-sm resize-none`}
                autoFocus={dangerAction === "restricted"} />
            </div>

            {dangerAction === "restricted" && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Auto-unlock after (optional):</p>
                <select value={restrictedUntil} onChange={(e) => setRestrictedUntil(e.target.value)}
                  className={`${ui.input} !py-2 !text-sm`}>
                  <option value="">Permanent (manual unlock)</option>
                  <option value="24h">24 hours</option>
                  <option value="72h">72 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              </div>
            )}

            {(dangerAction === "closed" || dangerAction === "suspended") && (
              <div>
                <p className="text-xs text-red-400 mb-2">
                  Type <span className="font-bold">{dangerAction.toUpperCase()}</span> to confirm:
                </p>
                <input type="text" value={dangerInput} onChange={(e) => setDangerInput(e.target.value)}
                  placeholder={dangerAction.toUpperCase()} className={`${ui.input} !py-2 !text-sm`} autoFocus />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setDangerAction(null); setDangerInput(""); setActionReason(""); setRestrictedUntil(""); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}>Cancel</button>
              <button onClick={() => updateStatus(dangerAction)}
                disabled={!actionReason.trim() || ((dangerAction === "closed" || dangerAction === "suspended") && dangerInput !== dangerAction.toUpperCase())}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white ${
                  dangerAction === "restricted" ? "bg-yellow-600 hover:bg-yellow-500" : "bg-red-600 hover:bg-red-500"
                } transition disabled:opacity-30 disabled:cursor-not-allowed`}>
                Confirm {dangerAction}
              </button>
            </div>
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
                ⚠ This approval will reach the threshold — refund executes immediately.
              </div>
            )}
            {approvalModal.action === "approve" && approvalModal.refund.votes + 1 < approvalModal.refund.required_approvals && (
              <p className={`text-xs ${ui.muted2}`}>
                After your vote: {approvalModal.refund.votes + 1}/{approvalModal.refund.required_approvals} — not yet executed.
              </p>
            )}
            {approvalModal.action === "reject" && (
              <div>
                <label className={`text-xs ${ui.muted2} block mb-1`}>Rejection note (optional)</label>
                <textarea value={approvalRejectNote} onChange={(e) => setApprovalRejectNote(e.target.value)}
                  placeholder="Why is this refund being rejected?" rows={3}
                  className={`${ui.input} !py-2 !text-sm resize-none`} />
              </div>
            )}
          </>
        )}
      </AdminConfirmModal>

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[440px] space-y-4 shadow-[0_0_40px_rgba(0,0,0,0.5)]`}>
            <h2 className="text-lg font-semibold text-orange-400">Issue Refund</h2>
            <p className={`text-sm ${ui.muted}`}>
              Tip {refundModal.tipId.slice(0, 8)}… — Refundable: <span className="text-white font-semibold">${(refundModal.tipAmount - refundModal.refundedAmount).toFixed(2)}</span>
            </p>
            <div>
              <label className={`text-xs ${ui.muted2} block mb-1`}>Reason *</label>
              <select value={refundReason} onChange={(e) => setRefundReason(e.target.value as RefundReason)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer">
                {REFUND_REASONS.map((r) => (
                  <option key={r} value={r} className="bg-zinc-900 text-white">{REFUND_REASON_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`text-xs ${ui.muted2} block mb-1`}>Note (optional)</label>
              <textarea value={refundNote} onChange={(e) => setRefundNote(e.target.value)}
                placeholder="Additional context…" rows={3}
                className={`${ui.input} !py-2 !text-sm resize-none w-full`} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setRefundModal(null); setRefundNote(""); setRefundReason("user_request"); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}>Cancel</button>
              <button onClick={submitRefund} disabled={refundSubmitting}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-500 transition disabled:opacity-50`}>
                {refundSubmitting ? "Processing…" : "Submit Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Confirmation Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[440px] space-y-4 shadow-[0_0_40px_rgba(0,0,0,0.5)]`}>
            <h2 className="text-lg font-semibold text-amber-400">
              Admin Override: {overrideModal.label}
            </h2>
            <p className={`text-sm ${ui.muted}`}>
              This will directly modify <span className="text-white font-semibold">{profile.display_name || profile.handle || "this user"}</span>&apos;s account.
              This action is logged permanently.
            </p>
            {disputeCount > 0 && (
              <div className="text-xs px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                This user has {disputeCount} active dispute(s). Proceed with caution.
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 mb-2">Reason (required, min 5 chars):</p>
              <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Why is this override necessary?" rows={3}
                className={`${ui.input} !py-2 !text-sm resize-none`} autoFocus />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setOverrideModal(null); setOverrideReason(""); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}>Cancel</button>
              <button onClick={submitOverride} disabled={overrideSubmitting || overrideReason.trim().length < 5}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-amber-600 hover:bg-amber-500 transition disabled:opacity-30 disabled:cursor-not-allowed`}>
                {overrideSubmitting ? "Applying…" : "Apply Override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CaseBadge({ label, value, color }: { label: string; value: string | number; color?: "red" | "yellow" }) {
  return (
    <div className={`px-3 py-2 rounded-xl text-xs border ${
      color === "red"
        ? "border-red-500/20 text-red-400 bg-red-500/10"
        : color === "yellow"
        ? "border-yellow-500/20 text-yellow-400 bg-yellow-500/10"
        : "border-white/10 text-white/70 bg-white/[.03]"
    }`}>
      <p className="text-[10px] opacity-60">{label}</p>
      <p className="font-semibold">{typeof value === "number" ? value : value}</p>
    </div>
  );
}
