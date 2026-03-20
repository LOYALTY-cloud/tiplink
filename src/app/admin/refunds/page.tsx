"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type RefundTip = {
  receipt_id: string;
  creator_user_id: string;
  tip_amount: number;
  refunded_amount: number;
  refund_status: string;
  refund_initiated_at: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  created_at: string;
};

type ConfirmState = {
  tipId: string;
  refundAmount: number;
  creatorBalance: number;
  newBalance: number;
} | null;

export default function AdminRefundsPage() {
  const [tips, setTips] = useState<RefundTip[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);

  useEffect(() => {
    fetchRefunds();
  }, [filter]);

  async function fetchRefunds() {
    setLoading(true);
    let query = supabase
      .from("tip_intents")
      .select(
        "receipt_id, creator_user_id, tip_amount, refunded_amount, refund_status, refund_initiated_at, stripe_payment_intent_id, status, created_at"
      )
      .neq("refund_status", "none")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter !== "all") {
      query = query.eq("refund_status", filter);
    }

    const { data } = await query;
    setTips(data ?? []);
    setLoading(false);
  }

  async function initiateRefund(tipId: string) {
    setActing(tipId);
    setMessage(null);

    // Risk check: fetch creator balance before proceeding
    const tip = tips.find((t) => t.receipt_id === tipId);
    if (tip) {
      const remaining = Number(tip.tip_amount) - Number(tip.refunded_amount ?? 0);
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", tip.creator_user_id)
        .maybeSingle();

      const balance = Number(wallet?.balance ?? 0);
      if (remaining > balance) {
        // Show real modal instead of confirm()
        setConfirmModal({
          tipId,
          refundAmount: remaining,
          creatorBalance: balance,
          newBalance: balance - remaining,
        });
        return; // Wait for modal confirmation
      }
    }

    await executeRefund(tipId);
  }

  async function executeRefund(tipId: string) {
    setActing(tipId);
    setConfirmModal(null);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/admin/refund", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tip_intent_id: tipId }),
    });

    const json = await res.json();
    setActing(null);
    setMessage(
      res.ok
        ? `Refund initiated: ${json.refund_id} ($${json.amount})`
        : `Error: ${json.error}`
    );
    fetchRefunds();
  }

  async function retryRefund(tipId: string) {
    setActing(tipId);
    setMessage(null);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/admin/refund/retry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tip_intent_id: tipId }),
    });

    const json = await res.json();
    setActing(null);
    setMessage(
      res.ok
        ? `Retry succeeded: ${json.refund_id} ($${json.amount})`
        : `Error: ${json.error}`
    );
    fetchRefunds();
  }

  function isStale(tip: RefundTip) {
    if (tip.refund_status !== "initiated" || !tip.refund_initiated_at) return false;
    return Date.now() - new Date(tip.refund_initiated_at).getTime() > 10 * 60 * 1000;
  }

  function statusColor(s: string) {
    switch (s) {
      case "initiated":
        return "text-orange-400";
      case "partial":
        return "text-yellow-400";
      case "full":
        return "text-green-400";
      default:
        return ui.muted;
    }
  }

  return (
    <div className="space-y-4">
      <h1 className={ui.h1}>Refunds</h1>

      {message && (
        <div className={`${ui.card} p-3 text-sm ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
          {message}
        </div>
      )}

      <div className="flex gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${ui.select} max-w-[200px]`}
        >
          <option value="all" className="bg-zinc-900 text-white">All refund statuses</option>
          <option value="initiated" className="bg-zinc-900 text-orange-400">Initiated</option>
          <option value="partial" className="bg-zinc-900 text-yellow-400">Partial</option>
          <option value="full" className="bg-zinc-900 text-green-400">Full</option>
        </select>
      </div>

      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : tips.length === 0 ? (
        <p className={ui.muted}>No refunds found.</p>
      ) : (
        <div className="space-y-3">
          {tips.map((t) => (
            <div key={t.receipt_id} className={`${ui.card} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  Tip {t.receipt_id.slice(0, 8)}…
                  <span className={`ml-2 text-xs ${ui.muted2}`}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </p>
                <p className={`text-xs ${ui.muted}`}>
                  Amount: ${Number(t.tip_amount).toFixed(2)} · Refunded: $
                  {Number(t.refunded_amount ?? 0).toFixed(2)} · Remaining: $
                  {(Number(t.tip_amount) - Number(t.refunded_amount ?? 0)).toFixed(2)}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                    t.refund_status === "initiated" ? "bg-orange-500/10 text-orange-400" :
                    t.refund_status === "partial" ? "bg-yellow-500/10 text-yellow-400" :
                    t.refund_status === "full" ? "bg-green-500/10 text-green-400" :
                    "bg-white/5 text-white/65"
                  }`}>
                    {t.refund_status}
                  </span>
                  <span className={`text-xs ${ui.muted2}`}>tip status: {t.status}</span>
                  {isStale(t) && (
                    <span className="text-xs font-semibold text-red-400">⚠ Stale (&gt;10m)</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                {t.refund_status !== "full" && t.refund_status !== "initiated" && (
                  <button
                    onClick={() => initiateRefund(t.receipt_id)}
                    disabled={acting === t.receipt_id}
                    className={`${ui.btnPrimary} ${ui.btnSmall}`}
                  >
                    {acting === t.receipt_id ? "…" : "Refund Remaining"}
                  </button>
                )}
                {isStale(t) && (
                  <button
                    onClick={() => retryRefund(t.receipt_id)}
                    disabled={acting === t.receipt_id}
                    className={`${ui.btnGhost} ${ui.btnSmall} hover:bg-orange-500/20 hover:border-orange-400/30`}
                  >
                    {acting === t.receipt_id ? "…" : "Retry"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Risk Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[420px] space-y-4`}>
            <h2 className="text-lg font-semibold text-red-400">
              ⚠ This refund will push the account negative
            </h2>
            <div className="space-y-1 text-sm">
              <p>
                <span className={ui.muted2}>Creator balance:</span>{" "}
                <span className="font-semibold">${confirmModal.creatorBalance.toFixed(2)}</span>
              </p>
              <p>
                <span className={ui.muted2}>Refund amount:</span>{" "}
                <span className="font-semibold text-orange-400">${confirmModal.refundAmount.toFixed(2)}</span>
              </p>
              <p>
                <span className={ui.muted2}>New balance:</span>{" "}
                <span className="font-bold text-red-400">${confirmModal.newBalance.toFixed(2)}</span>
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setConfirmModal(null); setActing(null); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                Cancel
              </button>
              <button
                onClick={() => executeRefund(confirmModal.tipId)}
                className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold text-white bg-red-600 hover:bg-red-500 transition`}
              >
                Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
