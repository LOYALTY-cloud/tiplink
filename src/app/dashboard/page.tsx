"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { ProfileRow, WalletRow } from "@/types/db";
import { useToast } from "@/lib/useToast";
import { formatMoney } from "@/lib/walletFees";
import { useRouter } from "next/navigation";
// ActivatePayoutsCard removed — payouts UI simplified
import { StripeReturnSync } from "@/components/StripeReturnSync";
import { ui } from "@/lib/ui";
import EarningsCard from "@/components/EarningsCard";

export default function DashboardPage() {
  const { toast, show } = useToast();
  const router = useRouter();
  const [handle, setHandle] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [wallet, setWallet] = useState<{
    balance: number;
    withdraw_fee: number;
  } | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);

  const reloadWallet = async (uid?: string) => {
    const targetId = uid || userId;
    if (!targetId) return;

    setLoadingWallet(true);
    const { data: walletData } = await supabase
      .from("wallets")
      .select("balance, withdraw_fee")
      .eq("user_id", targetId)
      .maybeSingle()
      .returns<WalletRow | null>();

    if (walletData) {
      setWallet({
        balance: Number(walletData.balance ?? 0),
        withdraw_fee: Number(walletData.withdraw_fee ?? 0),
      });
    } else {
      setWallet({ balance: 0, withdraw_fee: 0 });
    }
    setLoadingWallet(false);
  };

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;

      setUserId(user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("handle, stripe_account_id, payouts_enabled, account_status")
        .eq("user_id", user.id)
        .maybeSingle()
        .returns<ProfileRow | null>();

      setHandle(prof?.handle ?? null);
      setStripeAccountId(prof?.stripe_account_id ?? null);
      setPayoutsEnabled(Boolean(prof?.payouts_enabled));
      setAccountStatus(prof?.account_status ?? null);

      await reloadWallet(user.id);
    })();
  }, []);

  // Real-time balance refresh
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`dashboard-wallet-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions_ledger",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Optimistic balance merge
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

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const base = "";

  const tiplinkPath = handle ? `/${handle}` : "/(set-handle)";
  const fullUrl = useMemo(() => {
    const base = "https://tiplink.app";
    return handle ? `${base}${tiplinkPath}` : "";
  }, [handle, tiplinkPath]);

  const copy = async () => {
    if (!handle) {
      show("Set your handle in Profile first.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fullUrl);
    }
    show("Link copied OK");
  };

  const openPreview = () => {
    if (!handle) return show("Set your handle in Profile first.");
    window.open(fullUrl, "_blank");
  };

  if (accountStatus === "closed_finalized") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h1 className="text-xl font-semibold text-white">Account Closed</h1>
        <p className="mt-2 text-white/60">Your account has been fully closed and all funds have been withdrawn. Contact support if you have questions.</p>
      </div>
    );
  }

  const isClosed = accountStatus === "closed";

  return (
    <div className="space-y-6">
      <StripeReturnSync />

      {isClosed && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-yellow-800 text-sm font-medium">Your account is closed.</p>
          <p className="text-yellow-700 text-sm mt-1">You can still withdraw your remaining balance. All other features are disabled.</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {/* ActivatePayoutsCard removed — use Dashboard top summary/actions instead */}

      {/* Top info card */}
      <div className={`${ui.card} p-6`}>
        <h1 className={ui.h1}>Dashboard</h1>
        <p className={`mt-1 ${ui.muted}`}>Update your profile and share your TIPLINK to start receiving private support.</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-white/80">Payouts</div>
          <div className="flex items-center gap-3">
            <div className={`${ui.chip} ${payoutsEnabled ? "bg-emerald-500/10 border-emerald-400/20 text-emerald-200" : "bg-white/5 border-white/10 text-white/70"}`}>
              {payoutsEnabled ? "Payouts active" : stripeAccountId ? "Connected" : "Not connected"}
            </div>
            {stripeAccountId ? (
              <button onClick={() => router.push('/dashboard/onboarding')} className={`${ui.btnGhost} ${ui.btnSmall}`} disabled={isClosed}>
                Manage payouts
              </button>
            ) : (
              <button onClick={() => router.push('/dashboard/onboarding')} className={`${ui.btnPrimary} ${ui.btnSmall}`} disabled={isClosed}>
                Connect Stripe
              </button>
            )}
          </div>
        </div>

        {/* Removed chips: Private by default, Receipts included, No feeds • No DMs */}
      </div>

      {userId && (
        <div className="mb-4">
          <EarningsCard userId={userId} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Tiplink card */}
        <div className={`${ui.card} p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={ui.h2}>Your TIPLINK</h2>
              <p className={`mt-1 ${ui.muted}`}>This is the link you will share everywhere.</p>
            </div>

            {handle ? (
              <span className={`${ui.chip} bg-blue-500/10 border-blue-400/20 text-blue-200`}>Active</span>
            ) : (
              <span className={`${ui.chip} bg-amber-500/10 border-amber-400/20 text-amber-200`}>Set handle</span>
            )}
          </div>

          <div className={`${ui.cardInner} mt-4 p-3`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className={`text-xs ${ui.muted2}`}>Public URL</div>
                <div className={`text-sm font-medium ${ui.muted}`}>{handle ? fullUrl : "Go to Profile to set your handle"}</div>
              </div>

              <div className="flex gap-2">
                <button onClick={openPreview} className={`${ui.btnGhost} ${ui.btnSmall}`} disabled={!handle || isClosed}>
                  Open
                </button>
                <button onClick={copy} className={`${ui.btnPrimary} ${ui.btnSmall}`} disabled={!handle || isClosed}>
                  Copy
                </button>
              </div>
            </div>

            {!handle && (
              <p className={`mt-3 text-xs ${ui.muted}`}>Go to <span className="font-medium">Profile</span> and save your handle to activate your public link.</p>
            )}
          </div>

          <div className={`mt-3 text-xs ${ui.muted2}`}>Tip: Use this link on Instagram bio, flyers, business cards, and QR codes.</div>
        </div>

        {/* Wallet summary */}
        <div className={`${ui.card} p-6`}>
          <h2 className={ui.h2}>Wallet</h2>
          <p className={`mt-1 ${ui.muted}`}>Track your balance and payouts here.</p>

          <div className="mt-4">
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={`${ui.cardInner} p-4`}>
                <div className="text-xs text-white/50">Balance</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-400">{loadingWallet ? "…" : formatMoney(wallet?.balance ?? 0)}</div>
              </div>
              <div className={`${ui.cardInner} p-4`}>
                <div className="text-xs text-white/50">Withdrawal fee</div>
                <div className="mt-1 text-2xl font-semibold text-white/90">{loadingWallet ? "…" : formatMoney(wallet?.withdraw_fee ?? 0)}</div>
              </div>
            </div>

            <button onClick={() => router.push('/dashboard/wallet')} className={`${ui.btnPrimary} w-full mt-4`}>Withdraw to bank</button>
          </div>
        </div>

        {/* Share card */}
        <div className={`${ui.card} p-6 md:col-span-2`}>
          <h2 className={ui.h2}>Share</h2>
          <p className={`mt-1 ${ui.muted}`}>Download QR codes and share your link anywhere: flyers, bio links, booths, chairs, stages.</p>

            <div className="mt-4 flex flex-wrap gap-2">
            <Link className={`${ui.btnGhost} ${ui.btnSmall}`} href="/dashboard/share">Go to Share</Link>
            <Link className={`${ui.btnGhost} ${ui.btnSmall}`} href="/dashboard/profile">Edit Profile</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
