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
import VerifyEmailBanner from "@/components/VerifyEmailBanner";

export default function DashboardPage() {
  const { toast, show } = useToast();
  const router = useRouter();
  const [handle, setHandle] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState<string | null>(null);
  const [reviewRequested, setReviewRequested] = useState(false);
  const [chargesEnabled, setChargesEnabled] = useState<boolean>(false);
  const [showBanner, setShowBanner] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
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
      setUserEmail(user.email ?? null);

      const { data: prof } = await supabase
        .from("profiles")
        .select("handle, account_status, status_reason, stripe_account_id, stripe_charges_enabled, email_verified")
        .eq("user_id", user.id)
        .maybeSingle()
        .returns<ProfileRow | null>();

      setEmailVerified(Boolean(prof?.email_verified));

      setHandle(prof?.handle ?? null);
      setAccountStatus(prof?.account_status ?? null);
      setStatusReason(prof?.status_reason ?? null);
      setChargesEnabled(Boolean(prof?.stripe_charges_enabled));

      // Only show "Payments active" banner for accounts < 7 days old
      const createdAt = new Date(user.created_at ?? 0);
      const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const dismissed = localStorage.getItem("1nelink_payments_banner_dismissed");
      if (Boolean(prof?.stripe_charges_enabled) && daysSinceCreation < 7 && dismissed !== "true") {
        setShowBanner(true);
      }

      // Auto-sync Stripe status if account exists but charges not enabled in DB
      if (prof?.stripe_account_id && !prof?.stripe_charges_enabled) {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (token) {
          fetch("/api/stripe/connect/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({}),
          }).catch(() => {});
        }
      }

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

  // Real-time Stripe status refresh (webhook-driven)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`dashboard-profile-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as ProfileRow;
          if (updated.account_status) setAccountStatus(updated.account_status);
          if (updated.handle) setHandle(updated.handle);
          if (updated.stripe_charges_enabled != null) {
            setChargesEnabled((prev) => {
              if (!prev && updated.stripe_charges_enabled) {
                show("You're live! You can now receive tips.");
              }
              return Boolean(updated.stripe_charges_enabled);
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const base = "";

  const onelinkPath = handle ? `/${handle}` : "/(set-handle)";
  const fullUrl = useMemo(() => {
    const base = "https://1nelink.app";
    return handle ? `${base}${onelinkPath}` : "";
  }, [handle, onelinkPath]);

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

      {!emailVerified && userEmail && userId && (
        <VerifyEmailBanner email={userEmail} userId={userId} />
      )}

      {chargesEnabled && !isClosed && showBanner && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-center justify-between">
          <p className="text-emerald-300 text-sm font-medium">Payments active &mdash; you&apos;re receiving tips!</p>
          <button
            onClick={() => { setShowBanner(false); localStorage.setItem("1nelink_payments_banner_dismissed", "true"); }}
            className="text-emerald-300/60 hover:text-emerald-300 transition text-lg leading-none ml-3"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {isClosed && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p className="text-yellow-800 text-sm font-medium">Your account is closed.</p>
          <p className="text-yellow-700 text-sm mt-1">You can still withdraw your remaining balance. All other features are disabled.</p>
        </div>
      )}

      {accountStatus === "restricted" && (
        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-lg">
          <p className="text-red-400 text-sm font-semibold">🔒 Your account is restricted</p>
          <p className="text-red-400/70 text-sm mt-1">
            {statusReason
              ? `Your account is temporarily restricted: ${statusReason}`
              : "Please verify your identity to continue using your account. Withdrawals and tips are paused until resolved."}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={async () => {
                if (!userId || reviewRequested) return;
                setReviewRequested(true);
                const { data: { session } } = await supabase.auth.getSession();
                await fetch("/api/account/request-review", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token ?? ""}`,
                  },
                }).catch(() => {});
                show("Review request submitted. We'll follow up shortly.");
              }}
              disabled={reviewRequested}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition ${
                reviewRequested
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
              }`}
            >
              {reviewRequested ? "Review Requested ✓" : "Request Review"}
            </button>
            <a
              href="mailto:support@1nelink.com"
              className="text-sm font-medium text-red-300 hover:text-red-200 underline underline-offset-2 transition"
            >
              Contact Support →
            </a>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm shadow-lg">
            {toast.message}
          </div>
        </div>
      )}

      {/* Activate Payouts CTA — shown when Stripe is not connected */}
      {!chargesEnabled && !isClosed && accountStatus !== "restricted" && (
        <div className={`${ui.card} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Activate Payouts</h3>
              <p className={`mt-1 text-sm ${ui.muted}`}>
                Connect your account to start receiving tips and withdrawals.
              </p>
            </div>
            <span className={`${ui.chip} bg-amber-500/10 border-amber-400/20 text-amber-200`}>Required</span>
          </div>
          <button
            onClick={() => router.push("/dashboard/onboarding")}
            className={`${ui.btnPrimary} w-full mt-4`}
          >
            Activate Payouts
          </button>
          <p className={`mt-2 text-xs ${ui.muted2}`}>
            You&apos;ll be guided through Stripe&apos;s secure onboarding to verify your identity and link a bank account.
          </p>
        </div>
      )}

      {userId && (
        <div className="mb-4">
          <EarningsCard userId={userId} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* 1neLink card */}
        <div className={`${ui.card} p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={ui.h2}>Your 1NELINK</h2>
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
