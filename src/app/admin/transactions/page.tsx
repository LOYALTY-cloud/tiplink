"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type LedgerRow = {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  reference_id: string | null;
  status: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

const TYPE_OPTIONS = [
  "all",
  "tip_received",
  "tip_refunded",
  "withdrawal",
  "payout",
  "card_charge",
  "card_refund",
  "dispute",
  "adjustment",
] as const;

function typeColor(t: string) {
  switch (t) {
    case "tip_received":
      return "text-green-400";
    case "tip_refunded":
    case "dispute":
      return "text-red-400";
    case "withdrawal":
    case "payout":
      return "text-orange-400";
    case "card_charge":
      return "text-blue-400";
    default:
      return ui.muted;
  }
}

export default function AdminTransactionsPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Record<string, { handle: string | null; display_name: string | null }>>({});

  useEffect(() => {
    fetchLedger();
  }, [filter]);

  async function fetchLedger() {
    setLoading(true);
    let query = supabase
      .from("transactions_ledger")
      .select("id, user_id, type, amount, reference_id, status, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter !== "all") {
      query = query.eq("type", filter);
    }

    const { data } = await query;
    const ledger = data ?? [];
    setRows(ledger);

    // Batch-fetch profiles for all user IDs
    const ids = [...new Set(ledger.map((r) => r.user_id))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", ids);
      const map: Record<string, { handle: string | null; display_name: string | null }> = {};
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

  const filtered = search
    ? rows.filter(
        (r) =>
          r.user_id.includes(search) ||
          r.reference_id?.includes(search) ||
          r.id.includes(search) ||
          JSON.stringify(r.meta ?? {}).toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  return (
    <div className="space-y-4">
      <h1 className={ui.h1}>Transactions</h1>

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search user ID, reference, or metadata…"
          className={`${ui.input} max-w-sm`}
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${ui.select} max-w-[200px]`}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t} className="bg-zinc-900 text-white">
              {t === "all" ? "All types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className={ui.muted}>No transactions found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className={`${ui.card} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                    r.type === "tip_received" ? "bg-green-500/10 text-green-400" :
                    r.type === "tip_refunded" || r.type === "dispute" ? "bg-red-500/10 text-red-400" :
                    r.type === "withdrawal" || r.type === "payout" ? "bg-orange-500/10 text-orange-400" :
                    r.type === "card_charge" ? "bg-blue-500/10 text-blue-400" :
                    "bg-white/5 text-white/65"
                  }`}>
                    {r.type.replace(/_/g, " ")}
                  </span>
                  <span className={`text-xs ${ui.muted2}`}>
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className={`text-xs ${ui.muted2} truncate mt-0.5`}>
                  <Link href={`/admin/users/${r.user_id}`} className="text-blue-400 hover:text-blue-300 hover:underline">
                    {userLabel(r.user_id)}
                  </Link>
                  {r.reference_id && <> · Ref: {r.reference_id.slice(0, 8)}…</>}
                  {r.status && <> · Status: {r.status}</>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-bold ${
                    r.amount >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {r.amount >= 0 ? "+" : ""}${Math.abs(r.amount).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
