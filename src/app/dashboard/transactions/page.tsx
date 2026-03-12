"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/walletFees";
import { ui } from "@/lib/ui";

type TxRow =
  | {
      kind: "tip";
      id: string;
      created_at: string;
      title: string;
      amount: number;
      fee: number;
      net: number;
      status: string;
      note?: string | null;
    }
  | {
      kind: "withdrawal";
      id: string;
      created_at: string;
      title: string;
      amount: number;
      fee: number;
      net: number;
      status: string;
      note?: string | null;
    };

function badgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "succeeded" || s === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "failed" || s === "canceled") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: tips, error: tipsErr } = await supabase
        .from("tips")
        .select("id, created_at, tipper_name, amount, platform_fee, net, status, note")
        .eq("receiver_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (tipsErr) console.log("tips error:", tipsErr.message);

      const { data: withdrawals, error: wErr } = await supabase
        .from("withdrawals")
        .select("id, created_at, amount, fee, net, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (wErr) console.log("withdrawals error:", wErr.message);

      const tipRows: TxRow[] = (tips || []).map((t: unknown) => ({
        kind: "tip",
        id: t.id,
        created_at: t.created_at,
        title: t.tipper_name?.trim() ? t.tipper_name : "Anonymous tip",
        amount: Number(t.amount ?? 0),
        fee: Number(t.platform_fee ?? 0),
        net: Number(t.net ?? 0),
        status: t.status,
        note: t.note,
      }));

      const withdrawalRows: TxRow[] = (withdrawals || []).map((w: unknown) => ({
        kind: "withdrawal",
        id: w.id,
        created_at: w.created_at,
        title: "Instant withdrawal",
        amount: Number(w.amount ?? 0),
        fee: Number(w.fee ?? 0),
        net: Number(w.net ?? 0),
        status: w.status,
      }));

      const merged = [...tipRows, ...withdrawalRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setRows(merged);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPage(1), 0);
    return () => clearTimeout(t);
  }, [statusFilter, typeFilter]);

  const filteredRows = useMemo(() => {
    return rows.filter((tx) => {
      if (typeFilter !== "all" && tx.kind !== typeFilter) return false;
      if (statusFilter !== "all" && tx.status.toLowerCase() !== statusFilter) return false;
      return true;
    });
  }, [rows, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, clampedPage]);

  const empty = !loading && filteredRows.length === 0;

  return (
    <div className="space-y-6">
      <div className={`${ui.card} p-6`}>
        <h1 className={ui.h2}>Transactions</h1>
        <p className={ui.muted + " mt-1"}>Tips received and withdrawals in one place.</p>
      </div>

      <div className={`${ui.card} p-6`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`block text-sm ${ui.muted}`}>
            <span className={`block text-xs ${ui.muted2} mb-1`}>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white`}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="succeeded">Succeeded</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>

          <label className={`block text-sm ${ui.muted}`}>
            <span className={`block text-xs ${ui.muted2} mb-1`}>Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className={`w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white`}
            >
              <option value="all">All</option>
              <option value="tip">Tip</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </label>
        </div>

        <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 text-xs ${ui.muted}`}>
          <span>Showing {filteredRows.length} transactions</span>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setTypeFilter("all");
            }}
            className={`rounded-lg px-3 py-2 text-xs ${ui.muted2} border border-white/10`}
          >
            Clear filters
          </button>
        </div>

        {loading && <div className={ui.muted}>Loading...</div>}

        {empty && (
          <div className={ui.muted}>
            No transactions yet. When you receive tips or make a withdrawal, they will show up here.
          </div>
        )}

        {!loading && filteredRows.length > 0 && (
          <div className="space-y-3">
            {pagedRows.map((tx) => (
              <div key={`${tx.kind}_${tx.id}`} className={`${ui.cardInner} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-sm font-semibold text-white`}>{tx.kind === "tip" ? "Tip received" : "Withdrawal"}</div>
                    <div className={`text-sm ${ui.muted2} mt-1`}>{tx.title}</div>
                    <div className={`text-xs ${ui.muted2} mt-1`}>{new Date(tx.created_at).toLocaleString()}</div>
                  </div>

                  <span className={`text-xs font-medium px-2 py-1 rounded-full border ${badgeClass(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className={`${ui.cardInner} p-3`}>
                    <div className={`text-xs ${ui.muted2}`}>{tx.kind === "tip" ? "Tip amount" : "Withdraw amount"}</div>
                    <div className="font-semibold text-white">{formatMoney(tx.amount)}</div>
                  </div>
                  <div className={`${ui.cardInner} p-3`}>
                    <div className={`text-xs ${ui.muted2}`}>Fees</div>
                    <div className="font-semibold text-white">-{formatMoney(tx.fee)}</div>
                  </div>
                  <div className={`${ui.cardInner} p-3`}>
                    <div className={`text-xs ${ui.muted2}`}>You received</div>
                    <div className="font-semibold text-white">{formatMoney(tx.net)}</div>
                  </div>
                </div>

                {tx.note ? (
                  <div className={`mt-3 text-sm ${ui.muted2}`}>
                    <span className="font-medium">Note:</span> {tx.note}
                  </div>
                ) : null}
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={clampedPage === 1}
                className={`rounded-lg px-3 py-2 text-sm disabled:opacity-50 border border-white/10`}
              >
                Previous
              </button>
              <div className={`${ui.muted2}`}>
                Page {clampedPage} of {totalPages}
              </div>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={clampedPage === totalPages}
                className={`rounded-lg px-3 py-2 text-sm disabled:opacity-50 border border-white/10`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
