"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";
import { getAdminSession, getAdminHeaders } from "@/lib/auth/adminSession";
import AdminConfirmModal from "@/components/AdminConfirmModal";
import type { ConfirmVariant } from "@/components/AdminConfirmModal";

type User = {
  id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  email: string | null;
  account_status: string | null;
  owed_balance: number | null;
  is_flagged: boolean | null;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  // Stripe fields
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  restriction_level: string | null;
  stripe_verification_status: string | null;
  stripe_disabled_reason: string | null;
  stripe_account_id: string | null;
  stripe_last_synced_at: string | null;
  stripe_requirements_due_count: number | null;
  stripe_past_requirements_due_count: number | null;
  stripe_currently_due: string[] | null;
  stripe_past_due: string[] | null;
};

const STATUS_OPTIONS = ["active", "restricted", "suspended", "closed"] as const;

function isUserFlagged(u: User) {
  return (
    (u.account_status != null && u.account_status !== "active") ||
    Number(u.owed_balance ?? 0) > 0 ||
    u.is_flagged === true
  );
}

function AdminUsersContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") ?? "all";

  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ userId: string; status: string; displayName: string } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [restrictedUntil, setRestrictedUntil] = useState("");
  const [suspendedUntil, setSuspendedUntil] = useState("");
  const [syncingStripe, setSyncingStripe] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const isInitialLoad = useState(true);
  const canAssignRoles = (() => {
    const s = getAdminSession();
    return s?.role === "owner" || s?.role === "super_admin";
  })();
  const router = useRouter();

  useEffect(() => {
    fetchUsers(true);

    // Poll every 30s — unfiltered realtime on profiles is expensive at scale
    const interval = setInterval(() => fetchUsers(false), 30_000);

    return () => { clearInterval(interval); };
  }, [filter]);

  async function fetchUsers(showLoader = false) {
    if (showLoader) setLoading(true);
    setQueryError(null);

    const coreSelect = "id, user_id, handle, display_name, email, account_status, owed_balance, is_flagged, role, first_name, last_name, created_at, stripe_charges_enabled, stripe_payouts_enabled, restriction_level, stripe_verification_status, stripe_disabled_reason, stripe_account_id";
    const fullSelect = coreSelect + ", stripe_last_synced_at, stripe_requirements_due_count, stripe_past_requirements_due_count, stripe_currently_due, stripe_past_due";

    const buildQuery = (select: string) => {
      let q = supabase
        .from("profiles")
        .select(select)
        .not("role", "in", '("owner","super_admin","finance_admin","support_admin")')
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter === "flagged") {
        // broad fetch, filter client-side
      } else if (filter === "restricted") {
        q = q.or("account_status.eq.restricted,restriction_level.in.(high_risk,restricted)");
      } else if (filter !== "all") {
        q = q.eq("account_status", filter);
      }
      return q;
    };

    // Try full query (with new Stripe columns); fall back to core if columns missing
    let { data, error } = await buildQuery(fullSelect);
    if (error) {
      console.warn("fetchUsers: full query failed, trying core columns only:", error.message);
      ({ data, error } = await buildQuery(coreSelect));
      if (error) {
        console.error("fetchUsers: core query also failed:", error.message);
        setQueryError(error.message);
        setLoading(false);
        return;
      }
    }

    let result = (data ?? []) as User[];
    if (filter === "flagged") {
      result = result.filter(isUserFlagged);
    }

    setUsers(result);
    setLoading(false);
  }

  async function syncStripeForUser(userId: string) {
    setSyncingStripe(userId);
    try {
      const headers = getAdminHeaders();
      await fetch("/api/admin/stripe-sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      // Refresh list so the updated stripe data is shown
      await fetchUsers(false);
    } catch (e) {
      console.error("stripe sync failed", e);
    } finally {
      setSyncingStripe(null);
    }
  }

  async function updateStatus(userId: string, status: string, reason?: string, duration?: string) {
    setUpdating(userId);
    setPendingAction(null);
    setActionReason("");
    setRestrictedUntil("");
    setSuspendedUntil("");

    try {
      const headers = getAdminHeaders();
      if (!headers["X-Admin-Id"]) {
        alert("Admin session not found. Please log in again.");
        return;
      }

      const body: Record<string, unknown> = { user_id: userId, status, reason };
      // Dangerous actions already passed through the confirmation modal — auto-confirm
      if (status === "suspended" || status === "closed") {
        body.confirm_text = status.toUpperCase();
      }
      // Duration-based auto-lift for both restricted and suspended
      if ((status === "restricted" || status === "suspended") && duration) {
        body.restricted_until = duration;
      }

      const res = await fetch("/api/admin/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Failed to update status");
      } else {
        // Optimistically update the card so it reflects the new status instantly
        setUsers((prev) =>
          prev.map((u) => u.user_id === userId ? { ...u, account_status: status } : u)
        );
      }
    } catch {
      alert("Network error — status update failed");
    } finally {
      setUpdating(null);
      fetchUsers();
    }
  }

  const DESTRUCTIVE_STATUSES = ["suspended", "closed", "restricted"];

  function requestStatusChange(userId: string, status: string, displayName: string) {
    if (DESTRUCTIVE_STATUSES.includes(status)) {
      setActionReason("");
      setPendingAction({ userId, status, displayName });
    } else {
      updateStatus(userId, status);
    }
  }

  function navigateToAssign(u: User) {
    let firstName = u.first_name || "";
    let lastName = u.last_name || "";
    if (!firstName && !lastName && u.display_name) {
      const parts = u.display_name.trim().split(/\s+/);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ") || "";
    }
    const role = u.role && u.role !== "user" ? u.role : "support_admin";
    const params = new URLSearchParams({
      userId: u.user_id,
      firstName,
      lastName,
      email: u.email || "",
      role,
    });
    router.push(`/admin/users/create?${params.toString()}`);
  }

  const filtered = search
    ? users.filter(
        (u) => {
          const q = search.toLowerCase();
          return (
            u.handle?.toLowerCase().includes(q) ||
            u.display_name?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.first_name?.toLowerCase().includes(q) ||
            u.last_name?.toLowerCase().includes(q) ||
            u.id.includes(q) ||
            u.user_id?.includes(q)
          );
        }
      )
    : users;

  const sorted = [...filtered].sort((a, b) => {
    const riskA = isUserFlagged(a) ? 1 : 0;
    const riskB = isUserFlagged(b) ? 1 : 0;
    return riskB - riskA;
  });

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className={ui.h1}>Users</h1>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            Live
          </span>
        </div>
        {canAssignRoles && (
          <Link href="/admin/users/create" className="bg-emerald-500 hover:bg-emerald-600 text-black text-sm font-medium px-4 py-2 rounded-xl transition">
            + Create Admin
          </Link>
        )}
      </div>

      {/* STATS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={users.length} />
        <Stat label="Flagged" value={users.filter(isUserFlagged).length} color="text-red-400" />
        <Stat label="Restricted" value={users.filter(u => u.account_status === "restricted").length} color="text-yellow-400" />
        <Stat label="Suspended" value={users.filter(u => u.account_status === "suspended").length} color="text-orange-400" />
      </div>

      {/* SEARCH + FILTER */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <input
            id="user-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className={`${ui.input} pl-10 w-full`}
          />
          <span className="absolute left-3 top-2.5 text-white/30 text-sm pointer-events-none">🔍</span>
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${ui.select} max-w-[180px]`}
        >
          <option value="all" className="bg-zinc-900 text-white">All statuses</option>
          <option value="flagged" className="bg-zinc-900 text-white">⚑ Flagged / At Risk</option>
          <option value="active" className="bg-zinc-900 text-green-400">Active</option>
          <option value="restricted" className="bg-zinc-900 text-yellow-400">Restricted</option>
          <option value="suspended" className="bg-zinc-900 text-orange-400">Suspended</option>
          <option value="closed" className="bg-zinc-900 text-white/50">Closed</option>
        </select>
      </div>

      {/* USER LIST */}
      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : queryError ? (
        <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-400 font-semibold mb-1">Failed to load users</p>
          <p className="text-xs text-red-300/70 font-mono break-all">{queryError}</p>
          <p className="text-xs text-white/40 mt-2">A required database column may be missing. Run the pending migrations in Supabase and refresh.</p>
        </div>
      ) : sorted.length === 0 ? (
        <p className={ui.muted}>No users found.</p>
      ) : (
        <div id="user-actions" className="space-y-3">
          {sorted.map((u) => (
            <div
              key={u.id}
              className={`${ui.card} p-4 flex flex-col gap-3 transition-colors duration-200`}
            >
              <div className="flex items-center justify-between gap-3">
                {/* LEFT: Avatar + Identity */}
                <Link href={`/admin/users/${u.user_id}`} className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                    {(u.display_name || u.handle || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {u.display_name || "Unnamed"}
                      {u.handle && (
                        <span className="ml-2 text-xs text-white/40">@{u.handle}</span>
                      )}
                    </p>
                    <p className="text-xs text-white/40 truncate">
                      {u.email || u.id.slice(0, 12)}
                    </p>
                  </div>
                </Link>

                {/* RIGHT: Status Badges */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                    u.account_status === "active" ? "bg-green-500/10 text-green-400" :
                    u.account_status === "restricted" ? "bg-yellow-500/10 text-yellow-400" :
                    u.account_status === "suspended" ? "bg-red-500/10 text-red-400" :
                    "bg-white/5 text-white/40"
                  }`}>
                    {u.account_status ?? "active"}
                  </span>

                  {isUserFlagged(u) && (
                    <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-400/20 animate-pulse">
                      RISK
                    </span>
                  )}

                  {Number(u.owed_balance ?? 0) > 0 && (
                    <span className="text-xs text-red-400 font-semibold">
                      Owes ${Number(u.owed_balance).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* TRUST & RISK PROFILE */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Trust &amp; Risk Profile</span>
                  <div className="flex items-center gap-2">
                    {u.stripe_last_synced_at && (
                      <span className="text-[10px] text-white/25">
                        synced {(() => {
                          const diff = Date.now() - new Date(u.stripe_last_synced_at).getTime();
                          const mins = Math.floor(diff / 60000);
                          if (mins < 1) return "just now";
                          if (mins < 60) return `${mins}m ago`;
                          const hrs = Math.floor(mins / 60);
                          if (hrs < 24) return `${hrs}h ago`;
                          return `${Math.floor(hrs / 24)}d ago`;
                        })()}
                      </span>
                    )}
                    {u.stripe_account_id && (
                      <button
                        onClick={() => syncStripeForUser(u.user_id)}
                        disabled={syncingStripe === u.user_id}
                        className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition disabled:opacity-40"
                        title="Force pull fresh data from Stripe"
                      >
                        {syncingStripe === u.user_id ? "syncing…" : "↻ Sync"}
                      </button>
                    )}
                  </div>
                </div>

                {u.stripe_account_id ? (
                  <>
                    {/* Status pills row */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        u.stripe_charges_enabled ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {u.stripe_charges_enabled ? "✓" : "✗"} Charges
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        u.stripe_payouts_enabled ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {u.stripe_payouts_enabled ? "✓" : "✗"} Payouts
                      </span>
                      {u.restriction_level && u.restriction_level !== "none" && u.restriction_level !== "healthy" && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                          u.restriction_level === "high_risk" ? "bg-red-500/20 text-red-300 border border-red-400/20" :
                          u.restriction_level === "restricted" ? "bg-orange-500/15 text-orange-300" :
                          "bg-yellow-500/15 text-yellow-300"
                        }`}>
                          {u.restriction_level === "high_risk" ? "⚠️ High Risk" :
                           u.restriction_level === "restricted" ? "⚠ Restricted" : "⚠ Warning"}
                        </span>
                      )}
                      {u.stripe_verification_status && u.stripe_verification_status !== "verified" && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-300 font-medium">
                          🔓 {u.stripe_verification_status.replace(/_/g, " ")}
                        </span>
                      )}
                      {u.stripe_disabled_reason && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 font-medium" title={u.stripe_disabled_reason}>
                          {u.stripe_disabled_reason.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>

                    {/* Requirements breakdown */}
                    {((u.stripe_requirements_due_count ?? 0) > 0 || (u.stripe_past_requirements_due_count ?? 0) > 0) && (
                      <div className="flex flex-wrap gap-3 pt-0.5">
                        {(u.stripe_requirements_due_count ?? 0) > 0 && (
                          <div>
                            <span className="text-[10px] text-white/30 block">Currently Due</span>
                            <span className="text-[11px] text-yellow-400 font-semibold">{u.stripe_requirements_due_count} item{(u.stripe_requirements_due_count ?? 0) !== 1 ? "s" : ""}</span>
                            {u.stripe_currently_due && u.stripe_currently_due.length > 0 && (
                              <p className="text-[10px] text-white/25 mt-0.5 max-w-[200px] truncate" title={u.stripe_currently_due.join(", ")}>
                                {u.stripe_currently_due[0].replace(/_/g, " ")}{u.stripe_currently_due.length > 1 ? ` +${u.stripe_currently_due.length - 1}` : ""}
                              </p>
                            )}
                          </div>
                        )}
                        {(u.stripe_past_requirements_due_count ?? 0) > 0 && (
                          <div>
                            <span className="text-[10px] text-white/30 block">Past Due</span>
                            <span className="text-[11px] text-red-400 font-semibold">{u.stripe_past_requirements_due_count} item{(u.stripe_past_requirements_due_count ?? 0) !== 1 ? "s" : ""}</span>
                            {u.stripe_past_due && u.stripe_past_due.length > 0 && (
                              <p className="text-[10px] text-white/25 mt-0.5 max-w-[200px] truncate" title={u.stripe_past_due.join(", ")}>
                                {u.stripe_past_due[0].replace(/_/g, " ")}{u.stripe_past_due.length > 1 ? ` +${u.stripe_past_due.length - 1}` : ""}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-white/25">No Stripe account connected</p>
                )}
              </div>

              {/* ACTION ROW */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.filter((s) => s !== u.account_status).map((s) => (
                    <button
                      key={s}
                      onClick={() => requestStatusChange(u.user_id, s, u.display_name || u.handle || u.user_id)}
                      disabled={updating === u.user_id}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        s === "suspended" || s === "closed"
                          ? "text-red-400 border-red-400/20 hover:bg-red-500/20"
                          : s === "restricted"
                          ? "text-yellow-400 border-yellow-400/20 hover:bg-yellow-500/20"
                          : "text-green-400 border-green-400/20 hover:bg-green-500/20"
                      }`}
                    >
                      {updating === u.user_id ? "…" : s}
                    </button>
                  ))}
                </div>

                {canAssignRoles && (
                  <button
                    onClick={() => navigateToAssign(u)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-blue-400/20 text-blue-400 hover:bg-blue-500/20 transition"
                  >
                    Assign Role
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminConfirmModal
        open={!!pendingAction}
        title={`${pendingAction?.status === "closed" ? "Close" : pendingAction?.status === "suspended" ? "Suspend" : "Restrict"} Account`}
        confirmLabel={`Yes, ${pendingAction?.status === "closed" ? "Close" : pendingAction?.status === "suspended" ? "Suspend" : "Restrict"} Account`}
        variant={(pendingAction?.status === "suspended" || pendingAction?.status === "closed" ? "danger" : "reject") as ConfirmVariant}
        loading={!!updating}
        disabled={!actionReason.trim()}
        onConfirm={() => {
          if (pendingAction) updateStatus(
            pendingAction.userId,
            pendingAction.status,
            actionReason.trim(),
            pendingAction.status === "suspended" ? suspendedUntil : restrictedUntil
          );
        }}
        onCancel={() => { setPendingAction(null); setActionReason(""); setRestrictedUntil(""); setSuspendedUntil(""); }}
      >
        <p className="text-white/70">
          Are you sure you want to set{" "}
          <span className="font-semibold text-white">{pendingAction?.displayName}</span>{" "}
          to <span className="font-semibold text-red-400">{pendingAction?.status}</span>?
        </p>
        {pendingAction?.status === "closed" && (
          <p className="text-white/50 text-xs">The user will no longer receive tips but can still withdraw remaining funds.</p>
        )}
        {pendingAction?.status === "restricted" && (
          <>
            <p className="text-white/50 text-xs">The user will not be able to receive tips or withdraw funds until the restriction is lifted.</p>
            <div>
              <label className="text-xs text-white/50 block mb-1">Auto-unlock after (optional)</label>
              <select
                value={restrictedUntil}
                onChange={(e) => setRestrictedUntil(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-white/10 text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20"
              >
                <option value="" style={{background:"#18181b",color:"#fff"}}>Permanent (manual unlock)</option>
                <option value="24h" style={{background:"#18181b",color:"#fff"}}>24 hours</option>
                <option value="72h" style={{background:"#18181b",color:"#fff"}}>72 hours</option>
                <option value="7d" style={{background:"#18181b",color:"#fff"}}>7 days</option>
                <option value="30d" style={{background:"#18181b",color:"#fff"}}>30 days</option>
              </select>
            </div>
          </>
        )}
        {pendingAction?.status === "suspended" && (
          <>
            <p className="text-white/50 text-xs">The user will be fully locked out of all account functionality.</p>
            <div>
              <label className="text-xs text-white/50 block mb-1">Auto-unsuspend after (optional)</label>
              <select
                value={suspendedUntil}
                onChange={(e) => setSuspendedUntil(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-white/10 text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20"
              >
                <option value="" style={{background:"#18181b",color:"#fff"}}>Permanent (manual lift)</option>
                <option value="24h" style={{background:"#18181b",color:"#fff"}}>24 hours</option>
                <option value="72h" style={{background:"#18181b",color:"#fff"}}>72 hours</option>
                <option value="7d" style={{background:"#18181b",color:"#fff"}}>7 days</option>
                <option value="30d" style={{background:"#18181b",color:"#fff"}}>30 days</option>
                <option value="90d" style={{background:"#18181b",color:"#fff"}}>90 days</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label className="text-xs text-white/50 block mb-1">Reason for action <span className="text-red-400">*</span></label>
          <textarea
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            placeholder="Enter reason for this action..."
            rows={3}
            className="w-full rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
          />
          {!actionReason.trim() && (
            <p className="text-red-400/70 text-xs mt-1">A reason is required to proceed</p>
          )}
        </div>
      </AdminConfirmModal>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/[.03] border border-white/10">
      <p className="text-xs text-white/40">{label}</p>
      <p className={`text-lg font-semibold ${color || "text-white"}`}>{value}</p>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AdminUsersContent />
    </Suspense>
  );
}
