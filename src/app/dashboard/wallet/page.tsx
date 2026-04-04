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
  const [todayEarnings, setTodayEarnings] = useState<number>(0);
  const router = useRouter();
  
  const [payout, setPayout] = useState<{
    id: string;
    brand: string | null;
    last4: string | null;
  } | null>(null);

  type PayoutMethod = {
    id: string;
    brand: string | null;
    last4: string | null;
    is_default: boolean;
    type: string | null;
    stripe_external_account_id: string | null;
    provider: string | null;
  };
  const [allMethods, setAllMethods] = useState<PayoutMethod[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

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

  const loadAllMethods = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/payout-methods/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setAllMethods(json.methods ?? []);
      }
    } catch {}
  };

  const handleRemoveMethod = async (methodId: string) => {
    setRemovingId(methodId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/payout-methods/remove", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payout_method_id: methodId }),
      });
      if (res.ok) {
        await loadAllMethods();
        await loadPayout();
      }
    } finally {
      setRemovingId(null);
    }
  };

  const handleSetDefault = async (methodId: string) => {
    setSettingDefaultId(methodId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/payout-methods/set-default", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payout_method_id: methodId }),
      });
      if (res.ok) {
        await loadAllMethods();
        await loadPayout();
      }
    } finally {
      setSettingDefaultId(null);
    }
  };

  const loadTodayEarnings = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("transactions_ledger")
      .select("amount")
      .eq("user_id", user.id)
      .eq("type", "tip_credit")
      .gte("created_at", today.toISOString());

    if (data) {
      const sum = data.reduce((acc: number, row: { amount: number }) => acc + Number(row.amount), 0);
      setTodayEarnings(sum);
    }
  };



  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (user) setUserId(user.id);
      reloadWallet();
      loadPayout();
      loadAllMethods();
      loadTodayEarnings();
    })();
  }, []);

  // Real-time balance refresh on new ledger entries
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
          const tx = payload.new as { type?: string; amount?: number };
          if (tx.amount != null) {
            setWallet((prev) => {
              if (!prev) return prev;
              const delta = Number(tx.amount);
              return { ...prev, balance: prev.balance + delta };
            });
          }
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

  const onWithdraw = async () => {
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

    setTimeout(() => {
      setReceipt((current) => (current === newReceipt ? null : current));
    }, 8000);
  };

  return (
    <div>
      {/* Hero balance */}
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-white/50">Available balance</p>
        <h1
          key={availableBalance}
          className="text-4xl font-semibold tracking-tight text-white transition-all duration-300"
        >
          {loadingWallet ? "\u2026" : formatMoney(availableBalance)}
        </h1>
        <p className="text-xs text-emerald-400">
          {todayEarnings > 0
            ? `+${formatMoney(todayEarnings)} today`
            : availableBalance > 0
              ? "Ready to withdraw"
              : "No funds yet"}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => document.getElementById("withdraw-section")?.scrollIntoView({ behavior: "smooth" })}
          className="bg-emerald-500/20 text-emerald-400 py-3 rounded-xl font-medium hover:bg-emerald-500/30 transition"
        >
          Withdraw
        </button>
        <button
          onClick={() => setLinkOpen(true)}
          className="bg-white/5 border border-white/10 text-white/70 py-3 rounded-xl font-medium hover:bg-white/10 transition"
        >
          {hasCard ? "Replace card" : "Add payout"}
        </button>
      </div>

      {/* Withdraw card */}
      <div id="withdraw-section" className={`${ui.card} mt-6 p-4 space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white/90">Withdraw</h2>
          <span className={`${ui.chip} bg-blue-500/10 border-blue-400/20 text-blue-200`}>
            Instant payouts
          </span>
        </div>

        {/* Payout Method */}
        {!hasCard ? (
          <div className={`${ui.cardInner} p-3 flex items-center justify-between`}>
            <div className="text-sm text-white/55">No card linked</div>
            <button type="button" onClick={() => setLinkOpen(true)} className={`${ui.btnGhost} ${ui.btnSmall}`}>Link debit card</button>
          </div>
        ) : (
          <div className={`${ui.cardInner} p-3 flex items-center justify-between`}>
            <div className="text-sm text-white/70">
              {payout?.brand ? `${String(payout.brand).toUpperCase()} ` : ""}{"\u2022\u2022\u2022\u2022"} {payout?.last4}
            </div>
            <span className={`${ui.chip} bg-emerald-500/10 border-emerald-400/20 text-emerald-200`}>Instant</span>
          </div>
        )}

        {/* Amount input */}
        <div className="flex items-center gap-2">
          <input
            className="w-full bg-transparent text-3xl font-semibold outline-none placeholder:text-white/20 text-white"
            placeholder="$0.00"
            inputMode="decimal"
            autoFocus
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
          <button
            type="button"
            className={`${ui.btnGhost} ${ui.btnSmall} shrink-0`}
            onClick={() => quickFill(availableBalance)}
          >
            Max
          </button>
        </div>

        {/* Quick buttons */}
        <div className="flex flex-wrap gap-2">
          {[50, 100, 250, 500].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => quickFill(v)}
              className="rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm font-semibold text-white/75 hover:bg-white/10 active:scale-95 transition"
            >
              {formatMoney(v)}
            </button>
          ))}
        </div>

        {/* Errors */}
        {amountTooHigh && (
          <div className="text-sm text-red-300">
            Amount is more than your available balance.
          </div>
        )}
        {amountTooLow && (
          <div className="text-sm text-red-300">
            Minimum withdrawal is {formatMoney(1)}.
          </div>
        )}

        {/* Summary */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Amount</span>
            <span className="text-sm font-semibold text-white/90">{formatMoney(amount || 0)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">
              Fee{tierLabel ? <span className="ml-1 text-xs text-white/40">({tierLabel})</span> : null}
            </span>
            <span className="text-sm font-semibold text-white/90">-{formatMoney(fee)}</span>
          </div>

          <div className="border-t border-white/10 pt-3 flex items-center justify-between">
            <span className="text-sm text-white/80 font-semibold">You receive</span>
            <span className="text-xl font-semibold text-emerald-400">{formatMoney(net)}</span>
          </div>
        </div>

        {/* CTA */}
        <button onClick={onWithdraw} disabled={invalid || withdrawing || !hasCard} className={`${ui.btnPrimary} w-full`}>
          {withdrawing ? "Processing\u2026" : `Withdraw ${formatMoney(net)}`}
        </button>
        {!hasCard && (
          <p className="text-xs text-amber-400 mt-2">Link a debit card to withdraw</p>
        )}
      </div>

      {/* Withdrawal confirmation receipt */}
      {receipt && (
        <div className={`${ui.card} mt-6 p-5 border border-emerald-500/20 bg-emerald-500/5`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-emerald-400 text-lg">{"\u2705"}</span>
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
              <span className="text-sm text-white/80 font-semibold">You receive</span>
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

      {/* Payout Methods */}
      <div className={`${ui.card} mt-6 p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white/90">Payout Methods</h2>
          <button onClick={() => setLinkOpen(true)} className={`${ui.btnGhost} text-xs`}>
            + Add Card
          </button>
        </div>

        {allMethods.length === 0 ? (
          <p className="text-sm text-white/40">No payout methods linked yet.</p>
        ) : (
          <div className="space-y-3">
            {allMethods.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                  <span className="text-lg">💳</span>
                  <div>
                    <span className="text-sm font-medium text-white/90 uppercase">
                      {m.brand ?? m.type ?? "Card"} •••• {m.last4 ?? "????"}
                    </span>
                    {m.is_default && (
                      <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                        Default
                      </span>
                    )}
                    {m.stripe_external_account_id && (
                      <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                        Stripe
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!m.is_default && (
                    <button
                      onClick={() => handleSetDefault(m.id)}
                      disabled={settingDefaultId === m.id}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                    >
                      {settingDefaultId === m.id ? "Setting…" : "Set Default"}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveMethod(m.id)}
                    disabled={removingId === m.id}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {removingId === m.id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <LinkDebitCardModal open={linkOpen} onClose={() => setLinkOpen(false)} onLinked={() => { loadPayout(); loadAllMethods(); }} />

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
