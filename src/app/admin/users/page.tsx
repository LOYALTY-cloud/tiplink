"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type User = {
  id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  account_status: string | null;
  owed_balance: number | null;
  is_flagged: boolean | null;
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

export default function AdminUsersPage() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") ?? "all";

  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

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
        "id, user_id, handle, display_name, account_status, owed_balance, is_flagged, created_at"
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

  async function updateStatus(userId: string, status: string) {
    setUpdating(userId);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    await fetch("/api/admin/update-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id: userId, status }),
    });

    setUpdating(null);
    fetchUsers();
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
      <h1 className={ui.h1}>Users</h1>

      <div className="flex flex-wrap gap-3">
        <input
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
        <div className="space-y-3">
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

              <div className="flex gap-2 shrink-0">
                {STATUS_OPTIONS.filter((s) => s !== u.account_status).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(u.user_id, s)}
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
