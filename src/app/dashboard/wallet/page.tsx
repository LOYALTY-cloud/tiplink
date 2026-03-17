"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { WalletRow } from "@/types/db";
import LinkDebitCardModal from "@/components/LinkDebitCardModal";
import { EnablePayoutsModal } from "@/components/EnablePayoutsModal";
import { ui } from "@/lib/ui";
import { formatMoney, getWithdrawalFee } from "@/lib/walletFees";

interface WithdrawalReceipt {
  withdrawal_id: string;
  amount: number;
  fee: number;
  net: number;
  payout_status: string;
  payout_method: string;
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<{
    balance: number;
    withdraw_fee: number;
  } | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [receipt, setReceipt] = useState<WithdrawalReceipt | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();
  
  const [payout, setPayout] = useState<{
    id: string;
    brand: string | null;
    last4: string | null;
  } | null>(null);

  const reloadWallet = async () => {
    setLoadingWallet(true);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setWallet({ balance: 0, withdraw_fee: 0 });
      setLoadingWallet(false);
      return;
    }

    const { data, error } = await supabase
      .from("wallets")
      .select("balance, withdraw_fee")
      .eq("user_id", user.id)
      .maybeSingle()
      .returns<WalletRow | null>();

    if (error || !data) {
      setWallet({ balance: 0, withdraw_fee: 0 });
      setLoadingWallet(false);
      return;
    }

    setWallet({
      balance: Number(data.balance ?? 0),
      withdraw_fee: Number(data.withdraw_fee ?? 0),
    });

    setLoadingWallet(false);
  };

  const availableBalance = wallet?.balance ?? 0;
  const totalWithdrawFees = wallet?.withdraw_fee ?? 0;

  const [amountStr, setAmountStr] = useState("");
  const amount = useMemo(() => {
    const cleaned = amountStr.replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }, [amountStr]);

  const fee = useMemo(() => getWithdrawalFee(amount, "instant"), [amount]);
  const net = useMemo(() => Math.max(0, amount - fee), [amount, fee]);

  const amountTooLow = amount > 0 && amount < 1;
  const amountTooHigh = amount > availableBalance;
  const invalid = amount <= 0 || amountTooLow || amountTooHigh;

  const tierLabel = useMemo(() => {
    if (amount <= 0) return null;
    return "Instant: 5%";
  }, [amount]);

  const loadPayout = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setPayout(null);

    const { data } = await supabase
      .from("payout_methods")
      .select("id, brand, last4, is_default")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    setPayout(data ? { id: data.id, brand: data.brand, last4: data.last4 } : null);
  };

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (user) setUserId(user.id);
      reloadWallet();
      loadPayout();
    })();
  }, []);

  // Real-time balance refresh on new ledger entries — single subscription per user
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`wallet-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions_ledger",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Optimistic balance merge for snappy UX
          const tx = payload.new as { type?: string; amount?: number };
          if (tx.amount != null) {
            setWallet((prev) => {
              if (!prev) return prev;
              const delta = Number(tx.amount);
              return { ...prev, balance: prev.balance + delta };
            });
          }
          // Source-of-truth refresh
          reloadWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const hasCard = !!payout?.last4;

  const quickFill = (val: number) => setAmountStr(String(val));

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function ensurePayoutsEnabled(): Promise<boolean> {
    const token = await getAuthToken();
    if (!token) {
      alert("Please log in again.");
      return false;
    }

    const res = await fetch("/api/stripe/status", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Could not check payout status.");
      return false;
    }

    if (!json.connected || !json.payoutsEnabled) {
      setShowEnableModal(true);
      return false;
    }

    return true;
  }

  async function startStripeConnect() {
    // keep existing helper for backwards compatibility, but prefer navigating
    const token = await getAuthToken();
    if (!token) {
      alert("Please log in again.");
      return;
    }

    const res = await fetch("/api/stripe/connect/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Could not start Stripe onboarding.");
      return;
    }

    window.location.href = json.url;
  }

  const onWithdraw = async () => {
    // Check if Stripe payouts are enabled first
    const payoutsOk = await ensurePayoutsEnabled();
    if (!payoutsOk) return;

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return alert("Not logged in.");

    if (amount > availableBalance) return alert("Insufficient balance.");

    const token = await getAuthToken();
    if (!token) {
      alert("Please log in again.");
      return;
    }

    setWithdrawing(true);

    const res = await fetch("/api/withdrawals/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount }),
    });

    const json = await res.json();
    setWithdrawing(false);

    if (!res.ok) {
      alert(json.error || "Withdrawal failed.");
      return;
    }

    await reloadWallet();
    setAmountStr("");
    const newReceipt: WithdrawalReceipt = {
      withdrawal_id: json.withdrawal_id,
      amount: json.amount,
      fee: json.fee,
      net: json.net,
      payout_status: json.payout_status,
      payout_method: json.payout_method,
    };
    setReceipt(newReceipt);

    // Auto-dismiss receipt after 8 seconds
    setTimeout(() => {
      setReceipt((current) => (current === newReceipt ? null : current));
    }, 8000);
  };

  return (
    <div>
      {/* Balances row */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`${ui.cardInner} p-4`}>
          <div className="text-xs text-white/50">Balance</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-400">
            {loadingWallet ? "…" : formatMoney(availableBalance)}
          </div>
        </div>

        <div className={`${ui.cardInner} p-4`}>
          <div className="text-xs text-white/50">Withdrawal fee</div>
          <div className="mt-1 text-2xl font-semibold text-white/90">
            {loadingWallet ? "…" : formatMoney(totalWithdrawFees)}
          </div>
        </div>
      </div>

      {/* Withdraw card */}
      <div className={`${ui.card} mt-6 p-6`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white/90">Withdraw</h2>
            <p className="text-sm text-white/60 mt-1">
              Enter an amount and we’ll show the fee and what you will receive.
            </p>
          </div>

          <span className={`${ui.chip} bg-blue-500/10 border-blue-400/20 text-blue-200`}>
            Instant payouts
          </span>
        </div>

        <div className="mt-5">
          {/* Payout Method */}
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-white/80">Payout method</label>

              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                {hasCard ? "Replace card" : "Link debit card"}
              </button>
            </div>

            {!hasCard ? (
              <div className={`${ui.cardInner} mt-3 p-4`}>
                <div className="text-sm font-semibold text-white/85">No card linked</div>
                <p className="text-sm text-white/55 mt-1">
                  Link a debit card to enable instant withdrawals via Stripe.
                </p>
              </div>
            ) : (
              <div className={`${ui.cardInner} mt-3 p-4 flex items-center justify-between`}>
                <div>
                  <div className="text-sm font-semibold text-white/85">Debit card</div>
                  <div className="text-sm text-white/55">
                    {payout?.brand ? `${String(payout.brand).toUpperCase()} ` : ""}
                    •••• {payout?.last4}
                  </div>
                </div>

                <span className={`${ui.chip} bg-emerald-500/10 border-emerald-400/20 text-emerald-200`}>
                  Instant
                </span>
              </div>
            )}
          </div>

          {/* Amount */}
          <label className="text-sm font-semibold text-white/80">Withdrawal amount</label>

          <div className="mt-3 flex items-start gap-2">
            <div className="flex-1">
              <input
                className={ui.input}
                placeholder="0.00"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />

              <div className="mt-2 text-xs text-white/50">
                Available balance:{" "}
                <span className="font-semibold text-white/80">
                  {formatMoney(availableBalance)}
                </span>
              </div>
            </div>

            <button
              type="button"
              className={`${ui.btnGhost} ${ui.btnSmall} mt-[2px]`}
              onClick={() => quickFill(availableBalance)}
            >
              Max
            </button>
          </div>

          {/* Quick buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {[50, 100, 200, 500, 1000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => quickFill(v)}
                className="rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm font-semibold text-white/75 hover:bg-white/10 transition"
              >
                {formatMoney(v)}
              </button>
            ))}
          </div>

          {/* Errors */}
          {amountTooHigh && (
            <div className="mt-3 text-sm text-red-300">
              Amount is more than your available balance.
            </div>
          )}
          {amountTooLow && (
            <div className="mt-3 text-sm text-red-300">
              Minimum withdrawal is {formatMoney(1)}.
            </div>
          )}
        </div>

        {/* Summary */}
        <div className={`${ui.cardInner} mt-6 p-5`}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Withdrawal amount</span>
            <span className="text-sm font-semibold text-white/90">
              {formatMoney(amount || 0)}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-white/60">
              Withdrawal fee{" "}
              {tierLabel ? (
                <span className="ml-2 text-xs text-white/45">({tierLabel})</span>
              ) : null}
            </span>
            <span className="text-sm font-semibold text-white/90">-{formatMoney(fee)}</span>
          </div>

          <div className="mt-3 border-t border-white/10 pt-3 flex items-center justify-between">
            <span className="text-sm text-white/80 font-semibold">You will receive</span>
            <span className="text-lg font-semibold text-white/95">{formatMoney(net)}</span>
          </div>

          <div className="mt-3 text-xs text-white/45">Instant payouts are processed via Stripe Connect.</div>
        </div>

        {/* CTA */}
        <button onClick={onWithdraw} disabled={invalid || withdrawing} className={`${ui.btnPrimary} w-full mt-5`}>
          {withdrawing ? "Processing…" : "Withdraw to bank"}
        </button>

        <div className="mt-3 text-xs text-white/45">You’ll be prompted to complete payouts onboarding if needed.</div>
      </div>

      {/* Withdrawal confirmation receipt */}
      {receipt && (
        <div className={`${ui.card} mt-6 p-6 border border-emerald-500/30`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-emerald-400 text-lg">✅</span>
            <h2 className="text-lg font-semibold text-white/90">Withdrawal Started</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Amount</span>
              <span className="text-sm font-semibold text-white/90">{formatMoney(receipt.amount)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Fee (Instant: 5%)</span>
              <span className="text-sm font-semibold text-white/90">-{formatMoney(receipt.fee)}</span>
            </div>

            <div className="border-t border-white/10 pt-3 flex items-center justify-between">
              <span className="text-sm text-white/80 font-semibold">You will receive</span>
              <span className="text-lg font-semibold text-emerald-400">{formatMoney(receipt.net)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Status</span>
              <span className={`text-sm font-semibold ${receipt.payout_status === "paid" ? "text-emerald-400" : "text-amber-400"}`}>
                {receipt.payout_status === "paid" ? "Paid" : "Processing"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Method</span>
              <span className="text-sm text-white/70 capitalize">{receipt.payout_method}</span>
            </div>
          </div>

          <button
            onClick={() => setReceipt(null)}
            className={`${ui.btnGhost} w-full mt-5`}
          >
            Done
          </button>
        </div>
      )}

      {/* Modals (unchanged) */}
      <LinkDebitCardModal open={linkOpen} onClose={() => setLinkOpen(false)} onLinked={loadPayout} />

      <EnablePayoutsModal
        open={showEnableModal}
        onClose={() => setShowEnableModal(false)}
        onEnable={async () => {
          router.push("/dashboard/onboarding");
        }}
        balanceText={formatMoney(availableBalance)}
      />
    </div>
  );
}
