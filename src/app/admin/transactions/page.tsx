"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";

/* ── TYPES ─────────────────────────────────────────────────────────────────── */

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

type ProfileInfo = { handle: string | null; display_name: string | null };

const TYPE_OPTIONS = [
  "all",
  "tip_received",
  "tip_refunded",
  "withdrawal",
  "withdrawal_express",
  "payout",
  "card_charge",
  "card_refund",
  "dispute",
  "adjustment",
] as const;

/* ── HELPERS ───────────────────────────────────────────────────────────────── */

function typeBadge(t: string) {
  switch (t) {
    case "tip_received":
      return { bg: "bg-green-500/10", text: "text-green-400", icon: "↗" };
    case "tip_refunded":
      return { bg: "bg-red-500/10", text: "text-red-400", icon: "↩" };
    case "dispute":
      return { bg: "bg-red-500/10", text: "text-red-400", icon: "⚠" };
    case "withdrawal":
      return { bg: "bg-orange-500/10", text: "text-orange-400", icon: "↓" };
    case "withdrawal_express":
      return { bg: "bg-amber-500/10", text: "text-amber-400", icon: "⚡" };
    case "payout":
      return { bg: "bg-orange-500/10", text: "text-orange-400", icon: "↗" };
    case "card_charge":
      return { bg: "bg-blue-500/10", text: "text-blue-400", icon: "💳" };
    case "card_refund":
      return { bg: "bg-purple-500/10", text: "text-purple-400", icon: "↩" };
    case "adjustment":
      return { bg: "bg-white/5", text: "text-white/65", icon: "±" };
    default:
      return { bg: "bg-white/5", text: "text-white/65", icon: "•" };
  }
}

function groupLabel(dateStr: string): "today" | "yesterday" | "earlier" {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  if (d >= startOfToday) return "today";
  if (d >= startOfYesterday) return "yesterday";
  return "earlier";
}

const GROUP_LABELS: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

/* ── SOUND ─────────────────────────────────────────────────────────────────── */

function playTransactionSound() {
  try {
    const audio = new Audio("/sounds/success.mp3");
    audio.volume = 0.25;
    audio.play().catch(() => {});
  } catch { /* no audio support */ }
}

/* ── OUTPUT SANITIZER ──────────────────────────────────────────────────────── */

function sanitizeAIOutput(text: string): string {
  return text
    .replace(/sk_(live|test)_[\w]+/g, "[redacted]")
    .replace(/pk_(live|test)_[\w]+/g, "[redacted]")
    .replace(/acct_[\w]+/g, "[redacted]")
    .replace(/pi_[\w]+/g, "[redacted]")
    .replace(/cus_[\w]+/g, "[redacted]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[redacted]")
    .replace(/[0-9a-f]{32,}/g, "[redacted]");
}

/* ── MAIN PAGE ─────────────────────────────────────────────────────────────── */

export default function AdminTransactionsPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileInfo>>({});
  const [liveCount, setLiveCount] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    setLiveCount(0);
    try {
      const res = await fetch(`/api/admin/transactions?type=${filter}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || []);
        setProfileMap(data.profileMap || {});
      }
    } catch { /* network error — keep previous data */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  /* ── REALTIME SUBSCRIPTION ── */
  useEffect(() => {
    const channel = supabase
      .channel("txn-live-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions_ledger" },
        (payload) => {
          const newRow = payload.new as LedgerRow;
          // skip if filter active and doesn't match
          if (filter !== "all" && newRow.type !== filter) return;
          // dedupe
          setRows((prev) => {
            if (prev.some((r) => r.id === newRow.id)) return prev;
            return [newRow, ...prev];
          });
          // resolve profile for the new row so userLabel shows handle
          if (newRow.user_id) {
            setProfileMap((prev) => {
              if (prev[newRow.user_id]) return prev; // already known
              // fire-and-forget profile fetch
              supabase
                .from("profiles")
                .select("user_id, handle, display_name")
                .eq("user_id", newRow.user_id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setProfileMap((p) => ({ ...p, [data.user_id]: { handle: data.handle, display_name: data.display_name } }));
                  }
                });
              return prev;
            });
          }
          setNewIds((prev) => {
            const next = new Set(prev);
            next.add(newRow.id);
            return next;
          });
          setLiveCount((c) => c + 1);
          playTransactionSound();
          // clear "new" highlight after animation
          setTimeout(() => {
            setNewIds((prev) => {
              if (!prev.has(newRow.id)) return prev;
              const next = new Set(prev);
              next.delete(newRow.id);
              return next;
            });
          }, 2000);
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  /* user label with profile resolution */
  function userLabel(id: string) {
    const p = profileMap[id];
    if (p?.handle) return `@${p.handle}`;
    if (p?.display_name) return p.display_name;
    return `${id.slice(0, 8)}…`;
  }

  /* client-side search across user, reference, id, meta */
  const lowerSearch = search.toLowerCase();
  const filtered = search
    ? rows.filter(
        (r) =>
          r.user_id.toLowerCase().includes(lowerSearch) ||
          (r.reference_id?.toLowerCase().includes(lowerSearch) ?? false) ||
          r.id.toLowerCase().includes(lowerSearch) ||
          (profileMap[r.user_id]?.handle?.toLowerCase().includes(lowerSearch) ?? false) ||
          (profileMap[r.user_id]?.display_name?.toLowerCase().includes(lowerSearch) ?? false) ||
          JSON.stringify(r.meta ?? {}).toLowerCase().includes(lowerSearch)
      )
    : rows;

  /* compute summary stats */
  const totalVolume = filtered.reduce((s, r) => s + Math.abs(r.amount), 0);
  const riskCount = filtered.filter(
    (r) => r.type === "dispute" || r.type === "tip_refunded" || r.type === "card_refund"
  ).length;

  /* group by day */
  const groups: Record<string, LedgerRow[]> = { today: [], yesterday: [], earlier: [] };
  for (const r of filtered) {
    groups[groupLabel(r.created_at)].push(r);
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER ──────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={ui.h1}>Transactions</h1>
          <p className={`${ui.muted} mt-1`}>Monitor all platform activity in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          {liveCount > 0 && (
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
              +{liveCount} new
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            isLive
              ? "bg-green-500/10 text-green-400"
              : "bg-white/5 text-white/40"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              isLive ? "bg-green-400 animate-pulse" : "bg-white/30"
            }`} />
            {isLive ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>

      {/* ── SUMMARY CARDS ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Volume" value={`$${totalVolume.toFixed(2)}`} color="text-green-400" />
        <SummaryCard label="Transactions" value={String(filtered.length)} color="text-white" />
        <SummaryCard label="Risk Alerts" value={String(riskCount)} color={riskCount > 0 ? "text-red-400" : "text-white/45"} />
      </div>

      {/* ── SEARCH + FILTER BAR ─────────────────── */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search user, handle, reference, or metadata…"
          className={`${ui.input} max-w-sm`}
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${ui.select} max-w-[220px]`}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t} className="bg-zinc-900 text-white">
              {t === "all" ? "All types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {/* ── GROUPED TRANSACTION LIST ────────────── */}
      {loading ? (
        <div className="flex items-center gap-2 py-8">
          <span className="h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          <span className={ui.muted}>Loading transactions…</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className={ui.muted}>No transactions found.</p>
      ) : (
        <div className="space-y-6">
          {(["today", "yesterday", "earlier"] as const).map((g) =>
            groups[g].length > 0 ? (
              <TxnGroup key={g} title={GROUP_LABELS[g]} items={groups[g]} userLabel={userLabel} newIds={newIds} />
            ) : null
          )}
        </div>
      )}

      {/* ── AI INSIGHTS PANEL ───────────────────── */}
      {!loading && filtered.length > 0 && (
        <AIInsightsPanel txns={filtered} riskCount={riskCount} totalVolume={totalVolume} />
      )}
    </div>
  );
}

/* ── SUMMARY CARD ──────────────────────────────────────────────────────────── */

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`${ui.card} p-4 transition hover:border-white/20`}>
      <p className={`text-xs font-medium ${ui.muted2}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

/* ── TRANSACTION GROUP ─────────────────────────────────────────────────────── */

function TxnGroup({
  title,
  items,
  userLabel,
  newIds,
}: {
  title: string;
  items: LedgerRow[];
  userLabel: (id: string) => string;
  newIds: Set<string>;
}) {
  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold ${ui.muted}`}>{title}</p>
      {items.map((r) => (
        <TxnCard key={r.id} row={r} userLabel={userLabel} isNew={newIds.has(r.id)} />
      ))}
    </div>
  );
}

/* ── TRANSACTION CARD ──────────────────────────────────────────────────────── */

function TxnCard({ row: r, userLabel, isNew }: { row: LedgerRow; userLabel: (id: string) => string; isNew?: boolean }) {
  const badge = typeBadge(r.type);

  return (
    <div className={`${ui.card} p-4 transition hover:border-white/20 hover:bg-white/[0.03] group ${isNew ? "animate-card-enter border-green-500/30" : ""}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* left */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${badge.bg} ${badge.text}`}>
              {badge.icon} {r.type.replace(/_/g, " ")}
            </span>
            {r.status && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 ${ui.muted2}`}>
                {r.status}
              </span>
            )}
            <span className={`text-xs ${ui.muted2}`}>
              {new Date(r.created_at).toLocaleString()}
            </span>
          </div>

          <p className={`text-xs ${ui.muted2} truncate`}>
            <Link href={`/admin/users/${r.user_id}`} className="text-blue-400 hover:text-blue-300 hover:underline">
              {userLabel(r.user_id)}
            </Link>
            {r.reference_id && <> · Ref: {r.reference_id.slice(0, 8)}…</>}
          </p>
        </div>

        {/* right: amount */}
        <div className="shrink-0 text-right">
          <p className={`text-lg font-bold ${r.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
            {r.amount >= 0 ? "+" : ""}${Math.abs(r.amount).toFixed(2)}
          </p>
        </div>
      </div>

      {/* hover actions */}
      <div className="mt-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/admin/users/${r.user_id}`}
          className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          View User
        </Link>
        {(r.type === "dispute" || r.type === "tip_refunded" || r.type === "card_refund") && (
          <Link
            href="/admin/disputes"
            className="px-2 py-1 text-xs rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition"
          >
            Investigate
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── AI INSIGHTS PANEL ─────────────────────────────────────────────────────── */

function AIInsightsPanel({
  txns,
  riskCount,
  totalVolume,
}: {
  txns: LedgerRow[];
  riskCount: number;
  totalVolume: number;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  function fetchInsight() {
    if (insight || loading) return;
    setLoading(true);

    // ── SAFE CONTEXT: only aggregated counts, never user IDs or raw data ──
    const safeContext = {
      transaction_count: txns.length,
      total_volume: totalVolume,
      risk_count: riskCount,
      types: Object.fromEntries(
        [...new Set(txns.map((t) => t.type))].map((type) => [
          type,
          txns.filter((t) => t.type === type).length,
        ])
      ),
    };

    fetch("/api/admin/ai-assist", {
      method: "POST",
      headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Summarize recent transaction activity. There are ${txns.length} transactions totaling $${totalVolume.toFixed(2)} in volume with ${riskCount} risk-flagged items (disputes, refunds). Highlight anything unusual and suggest what to review.`,
        context: {
          page: "transactions",
          data: safeContext,
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        const raw = d.reply || "No unusual activity detected. Continue monitoring transactions.";
        setInsight(sanitizeAIOutput(raw));
      })
      .catch(() => setInsight("No unusual activity detected. Continue monitoring transactions."))
      .finally(() => setLoading(false));
  }

  return (
    <div className={`${ui.card} overflow-hidden transition`}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchInsight();
        }}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.03] transition"
      >
        <span className="text-sm font-semibold">🧠 AI Insights <span className="font-normal text-white/35 text-xs ml-1">Assistive only — does not take action</span></span>
        <span className={`text-xs ${ui.muted2} transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3">
          {loading ? (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              <span className={`text-sm ${ui.muted}`}>Analyzing transactions…</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{insight}</p>
              <p className={`text-[10px] mt-3 ${ui.muted2}`}>
                AI analysis is advisory only. Always verify before acting.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
