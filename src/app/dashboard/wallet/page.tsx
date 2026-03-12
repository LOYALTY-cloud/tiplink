"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import LinkDebitCardModal from "@/components/LinkDebitCardModal";
import { EnablePayoutsModal } from "@/components/EnablePayoutsModal";
import { ui } from "@/lib/ui";
import { formatMoney, getWithdrawalFee } from "@/lib/walletFees";

export default function WalletPage() {
  const [wallet, setWallet] = useState<{
    available: number;
    pending: number;
    withdraw_fee: number;
  } | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  
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
      setWallet({ available: 0, pending: 0, withdraw_fee: 0 });
      setLoadingWallet(false);
      return;
    }

    const { data, error } = await supabase
      .from("wallets")
      .select("available, pending, withdraw_fee")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      setWallet({ available: 0, pending: 0, withdraw_fee: 0 });
      setLoadingWallet(false);
      return;
    }

    setWallet({
      available: Number(data.available ?? 0),
      pending: Number(data.pending ?? 0),
      withdraw_fee: Number(data.withdraw_fee ?? 0),
    });

    setLoadingWallet(false);
  };

  const availableBalance = wallet?.available ?? 0;
  const pendingBalance = wallet?.pending ?? 0;
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
    const t = setTimeout(() => {
      reloadWallet();
      loadPayout();
    }, 0);
    return () => clearTimeout(t);
  }, []);

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

    const res = await fetch("/api/withdrawals/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount }),
    });

    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Withdrawal failed.");
      return;
    }

    await reloadWallet();
    alert("Withdrawal started ✅");
  };

  return (
    <div>
      {/* Balances row */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`${ui.cardInner} p-4`}>
          <div className="text-xs text-white/50">Available</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-400">
            {loadingWallet ? "…" : formatMoney(availableBalance)}
          </div>
        </div>

        <div className={`${ui.cardInner} p-4`}>
          <div className="text-xs text-white/50">Pending</div>
          <div className="mt-1 text-2xl font-semibold text-white/90">
            {loadingWallet ? "…" : formatMoney(pendingBalance)}
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
        <button onClick={onWithdraw} disabled={invalid} className={`${ui.btnPrimary} w-full mt-5`}>
          Withdraw to bank
        </button>

        <div className="mt-3 text-xs text-white/45">You’ll be prompted to complete payouts onboarding if needed.</div>
      </div>

      {/* Modals (unchanged) */}
      <LinkDebitCardModal open={linkOpen} onClose={() => setLinkOpen(false)} onLinked={loadPayout} />

      <EnablePayoutsModal
        open={showEnableModal}
        onClose={() => setShowEnableModal(false)}
        onEnable={startStripeConnect}
        balanceText={formatMoney(availableBalance)}
      />
    </div>
  );
}
