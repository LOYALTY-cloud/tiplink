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
  const canAssignRoles = (() => {
    const s = getAdminSession();
    return s?.role === "owner" || s?.role === "super_admin";
  })();
  const router = useRouter();

  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel("admin-users-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => fetchUsers()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  async function fetchUsers() {
    setLoading(true);
    let query = supabase
      .from("profiles")
      .select(
        "id, user_id, handle, display_name, email, account_status, owed_balance, is_flagged, role, first_name, last_name, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter === "flagged") {
      // Flagged = non-active OR owed > 0 OR is_flagged
      // We can't do an OR at the Supabase level easily, so fetch broader and filter client-side
    } else if (filter !== "all") {
      query = query.eq("account_status", filter);
    }

    const { data } = await query;
    let result = data ?? [];

    if (filter === "flagged") {
      result = result.filter(isUserFlagged);
    }

    setUsers(result);
    setLoading(false);
  }

  async function updateStatus(userId: string, status: string, reason?: string) {
    setUpdating(userId);
    setPendingAction(null);
    setActionReason("");
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) return;

    await fetch("/api/admin/update-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ user_id: userId, status, reason }),
    });

    setUpdating(null);
    fetchUsers();
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
        (u) =>
          u.handle?.toLowerCase().includes(search.toLowerCase()) ||
          u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
          u.id.includes(search)
      )
    : users;

  function statusColor(s: string | null) {
    switch (s) {
      case "active":
        return "text-green-400";
      case "restricted":
        return "text-yellow-400";
      case "suspended":
        return "text-red-400";
      case "closed":
      case "closed_finalized":
        return "text-white/40";
      default:
        return ui.muted;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className={ui.h1}>Users</h1>
        {canAssignRoles && (
          <Link href="/admin/users/create" className="bg-emerald-500 hover:bg-emerald-600 text-black text-sm font-medium px-4 py-2 rounded-xl transition">
            + Create Admin
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          id="user-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search handle, name, email, or ID…"
          className={`${ui.input} max-w-sm`}
        />

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

      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className={ui.muted}>No users found.</p>
      ) : (
        <div id="user-actions" className="space-y-3">
          {filtered.map((u) => (
            <div
              key={u.id}
              className={`${ui.card} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
            >
              <Link href={`/admin/users/${u.user_id}`} className="min-w-0 hover:opacity-80 transition">
                <p className="font-medium truncate">
                  {u.display_name || u.handle || "—"}
                  {u.handle && (
                    <span className={`ml-2 text-sm ${ui.muted2}`}>@{u.handle}</span>
                  )}
                </p>
                <p className={`text-xs ${ui.muted2} truncate`}>
                  {u.id}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                    u.account_status === "active" ? "bg-green-500/10 text-green-400" :
                    u.account_status === "restricted" ? "bg-yellow-500/10 text-yellow-400" :
                    u.account_status === "suspended" ? "bg-orange-500/10 text-orange-400" :
                    u.account_status === "closed" || u.account_status === "closed_finalized" ? "bg-white/5 text-white/40" :
                    "bg-green-500/10 text-green-400"
                  }`}>
                    {u.account_status ?? "active"}
                  </span>
                  {Number(u.owed_balance ?? 0) > 0 && (
                    <span className="text-xs font-semibold text-red-400">
                      Owed: ${Number(u.owed_balance).toFixed(2)}
                    </span>
                  )}
                  {isUserFlagged(u) && (
                    <span className="text-xs font-semibold bg-red-500/10 text-red-400 border border-red-400/20 px-2 py-0.5 rounded-full">
                      FLAGGED
                    </span>
                  )}
                  {u.is_flagged && (
                    <span className="text-xs font-semibold text-orange-400">⚑ Manually flagged</span>
                  )}
                </div>
              </Link>

              <div className="flex flex-wrap gap-2 shrink-0">
                {STATUS_OPTIONS.filter((s) => s !== u.account_status).map((s) => (
                  <button
                    key={s}
                    onClick={() => requestStatusChange(u.user_id, s, u.display_name || u.handle || u.user_id)}
                    disabled={updating === u.user_id}
                    className={`${ui.btnGhost} ${ui.btnSmall} ${
                      s === "suspended" || s === "closed"
                        ? "hover:bg-red-500/20 hover:border-red-400/30"
                        : s === "restricted"
                        ? "hover:bg-yellow-500/20 hover:border-yellow-400/30"
                        : "hover:bg-green-500/20 hover:border-green-400/30"
                    }`}
                  >
                    {updating === u.user_id ? "…" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                {canAssignRoles && (
                  <button
                    onClick={() => navigateToAssign(u)}
                    className={`${ui.btnGhost} ${ui.btnSmall} hover:bg-blue-500/20 hover:border-blue-400/30 text-blue-400`}
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
          if (pendingAction) updateStatus(pendingAction.userId, pendingAction.status, actionReason.trim());
        }}
        onCancel={() => { setPendingAction(null); setActionReason(""); }}
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
          <p className="text-white/50 text-xs">The user will not be able to receive tips or withdraw funds until the restriction is lifted.</p>
        )}
        {pendingAction?.status === "suspended" && (
          <p className="text-white/50 text-xs">The user will be fully locked out of all account functionality.</p>
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

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AdminUsersContent />
    </Suspense>
  );
}
