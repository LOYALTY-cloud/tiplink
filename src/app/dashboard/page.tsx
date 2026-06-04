"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getNetWithdrawalAmount } from "@/lib/walletFees";
import type { ProfileRow, WalletRow } from "@/types/db";
import { useToast } from "@/lib/useToast";
import { formatMoney } from "@/lib/walletFees";
import { useRouter } from "next/navigation";
// ActivatePayoutsCard removed — payouts UI simplified
import { StripeReturnSync } from "@/components/StripeReturnSync";
import { ui } from "@/lib/ui";
import EarningsCard from "@/components/EarningsCard";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import StripeRestrictionModal from "@/components/StripeRestrictionModal";

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
  const [showWelcome, setShowWelcome] = useState(false);
  const [wallet, setWallet] = useState<{
    balance: number;
    withdraw_fee: number;
  } | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [tipFloat, setTipFloat] = useState<number | null>(null);
  const [instantAvailable, setInstantAvailable] = useState<number | null>(null);
  const [stripeAvailable, setStripeAvailable] = useState<number | null>(null);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [pendingAvailableOn, setPendingAvailableOn] = useState<string | null>(null);
  const [withdrawCardMode, setWithdrawCardMode] = useState<"instant" | "standard">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("dashboard_withdraw_card_mode") as "instant" | "standard") || "instant";
    }
    return "instant";
  });
  const [showWithdrawCardMenu, setShowWithdrawCardMenu] = useState(false);

  // Creator application
  const [isCreator, setIsCreator] = useState<boolean | null>(null);
  const [creatorApp, setCreatorApp] = useState<{ status: string; review_notes: string | null } | null>(null);
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [showRestrictionModal, setShowRestrictionModal] = useState(false);
  const [stripeProfile, setStripeProfile] = useState<any>(null);
  const [applyForm, setApplyForm] = useState({ social_links: "", description: "", audience_size: "" });
  const [applyState, setApplyState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const reloadWallet = async (uid?: string) => {
    const targetId = uid || userId;
    if (!targetId) return;

    setLoadingWallet(true);

    // Fetch enriched balance (includes Stripe pending + instant)
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (token) {
      try {
        const res = await fetch("/api/wallet/balance", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json().catch(() => null);
        if (j && !j.error) {
          const bal = Number(j.total_balance ?? 0);
          setWallet({ balance: bal, withdraw_fee: 0 });
          setInstantAvailable(typeof j.instant_available === "number" ? j.instant_available : getNetWithdrawalAmount(bal, "instant"));
          setStripeAvailable(typeof j.stripe_available === "number" ? j.stripe_available : bal);
          setPendingAmount(typeof j.available_soon === "number" ? j.available_soon : bal);
          if (typeof j.pending_available_on === "string") setPendingAvailableOn(j.pending_available_on);
          setLoadingWallet(false);
          return;
        }
      } catch { /* fall through to DB fallback */ }
    }

    // Fallback: read balance directly from DB (e.g. token missing)
    const { data: walletData } = await supabase
      .from("wallets")
      .select("balance, withdraw_fee")
      .eq("user_id", targetId)
      .maybeSingle()
      .returns<WalletRow | null>();

    const bal = Number(walletData?.balance ?? 0);
    setWallet({ balance: bal, withdraw_fee: Number(walletData?.withdraw_fee ?? 0) });
    setInstantAvailable(getNetWithdrawalAmount(bal, "instant"));
    setPendingAmount(0); // no Stripe data available in fallback — pending is unknown, show $0
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
        .select(
          "handle, account_status, status_reason, stripe_account_id, stripe_charges_enabled, email_verified, is_creator, " +
          "stripe_payouts_enabled, stripe_disabled_reason, stripe_currently_due, stripe_pending_verification, " +
          "stripe_capabilities, monetization_enabled, stripe_verification_status"
        )
        .eq("user_id", user.id)
        .maybeSingle()
        .returns<ProfileRow | null>();

      // Treat as verified if either our profiles column OR Supabase's own
      // email_confirmed_at is set — whichever path the user took to verify.
      setEmailVerified(Boolean(prof?.email_verified) || Boolean(user.email_confirmed_at));

      setHandle(prof?.handle ?? null);
      setAccountStatus(prof?.account_status ?? null);
      setStatusReason(prof?.status_reason ?? null);
      setChargesEnabled(Boolean(prof?.stripe_charges_enabled));
      setIsCreator(Boolean((prof as (typeof prof & { is_creator?: boolean }) | null)?.is_creator));

      // Show restriction modal if the account has any Stripe issues
      if (prof?.stripe_account_id) {
        setStripeProfile(prof);
        const hasIssue =
          !prof?.stripe_charges_enabled ||
          !prof?.stripe_payouts_enabled ||
          (prof as any)?.stripe_currently_due?.length > 0 ||
          (prof as any)?.stripe_disabled_reason ||
          (prof as any)?.stripe_verification_status === "restricted";
        const modalDismissed = sessionStorage.getItem("stripe_restriction_modal_dismissed");
        if (hasIssue && !modalDismissed) setShowRestrictionModal(true);
      }

      // Fetch creator application status
      const { data: sessForApply } = await supabase.auth.getSession();
      const applyToken = sessForApply.session?.access_token;
      if (applyToken) {
        fetch("/api/creator/apply", { headers: { Authorization: `Bearer ${applyToken}` } })
          .then((r) => r.json())
          .then((j) => {
            setIsCreator(j.is_creator ?? false);
            setCreatorApp(j.application ?? null);
            // If gate redirected here, auto-open modal
            if (!j.is_creator && !j.application && Boolean(prof?.stripe_charges_enabled) && window.location.search.includes("creator_gate")) {
              setShowCreatorModal(true);
            }
          })
          .catch(() => {});
      }

      // Only show "Payments active" banner for accounts < 7 days old
      const createdAt = new Date(user.created_at ?? 0);
      const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const dismissed = localStorage.getItem("1nelink_payments_banner_dismissed");
      if (Boolean(prof?.stripe_charges_enabled) && daysSinceCreation < 7 && dismissed !== "true") {
        setShowBanner(true);
      }

      // Show welcome card for new users (< 1 day old, not dismissed)
      const welcomeDismissed = localStorage.getItem("1nelink_welcome_dismissed");
      if (daysSinceCreation < 1 && welcomeDismissed !== "true") {
        setShowWelcome(true);
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
            const delta = Number(tx.amount);
            setWallet((prev) => {
              if (!prev) return prev;
              return { ...prev, balance: prev.balance + delta };
            });
            // Trigger floating +$X animation for incoming tips
            if (delta > 0) {
              setTipFloat(delta);
              setTimeout(() => setTipFloat(null), 1500);
            }
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
          if (updated.email_verified != null) setEmailVerified(Boolean(updated.email_verified));
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

  // Re-check email_verified when user returns to this tab
  // (they may have clicked the confirmation link in another tab)
  useEffect(() => {
    if (!userId) return;
    async function recheckVerification() {
      if (document.visibilityState !== "visible") return;
      // Check both our profiles column and Supabase's own email_confirmed_at
      const [{ data: prof }, { data: userRes }] = await Promise.all([
        supabase.from("profiles").select("email_verified").eq("user_id", userId!).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (prof?.email_verified || userRes.user?.email_confirmed_at) setEmailVerified(true);
    }
    document.addEventListener("visibilitychange", recheckVerification);
    return () => document.removeEventListener("visibilitychange", recheckVerification);
  }, [userId]);

  const onelinkPath = handle ? `/${handle}` : "/(set-handle)";
  const fullUrl = useMemo(() => {
    const base = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "https://1nelink.app")
    ).replace(/\/$/, "");
    return handle ? `${base}${onelinkPath}` : "";
  }, [handle, onelinkPath]);

  async function submitApplication() {
    if (!applyForm.description.trim()) {
      setApplyMsg("Please describe what you plan to sell.");
      setApplyState("error");
      return;
    }
    setApplyState("loading");
    setApplyMsg(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/creator/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(applyForm),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to submit");
      setApplyState("success");
      setApplyMsg("Application submitted! We'll review it soon.");
      setCreatorApp({ status: "pending", review_notes: null });
      setTimeout(() => setShowCreatorModal(false), 2000);
    } catch (e) {
      setApplyState("error");
      setApplyMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

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

  const isClosed = accountStatus === "closed" || accountStatus === "closed_finalized";

  return (
    <div className="space-y-5">
      <StripeReturnSync />

      <StripeRestrictionModal
        open={showRestrictionModal}
        onClose={() => {
          sessionStorage.setItem("stripe_restriction_modal_dismissed", "1");
          setShowRestrictionModal(false);
        }}
        creator={stripeProfile}
      />

      {!emailVerified && userEmail && userId && (
        <VerifyEmailBanner email={userEmail} userId={userId} />
      )}

      {/* Welcome card — first-time users */}
      {showWelcome && (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-blue-500/5 p-6 animate-[fadeInUp_0.5s_ease]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                🎉 Your link is ready!
              </h2>
              <p className="text-sm text-white/70 mt-1">
                Share your 1neLink to start earning tips. It only takes a second.
              </p>
            </div>
            <button
              onClick={() => { setShowWelcome(false); localStorage.setItem("1nelink_welcome_dismissed", "true"); }}
              className="text-white/45 hover:text-white/60 transition text-lg leading-none ml-3 shrink-0"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={copy}
              disabled={!handle}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400 transition active:scale-[0.97] disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Link
            </button>
            <button
              onClick={openPreview}
              disabled={!handle}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 border border-white/[0.12] text-white font-semibold text-sm hover:bg-white/15 transition active:scale-[0.97] disabled:opacity-40"
            >
              Open Tip Page →
            </button>
          </div>
        </div>
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
        <div className="bg-yellow-500/10 border border-yellow-400/20 p-4 rounded-xl">
          <p className="text-yellow-300 text-sm font-medium">Your account is closed.</p>
          <p className="text-yellow-300/60 text-sm mt-1">
            {accountStatus === "closed_finalized"
              ? "Your account has been fully closed and all funds have been withdrawn. Contact support if you have questions."
              : "You can still withdraw your remaining balance. All other features are disabled."}
          </p>
        </div>
      )}

      {accountStatus === "restricted" && (
        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl">
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
                try {
                  const res = await fetch("/api/account/request-review", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session?.access_token ?? ""}`,
                    },
                  });
                  if (res.ok) {
                    show("Review request submitted. We'll follow up shortly.");
                  } else {
                    setReviewRequested(false);
                    show("Failed to submit review request. Please try again.");
                  }
                } catch {
                  setReviewRequested(false);
                  show("Failed to submit review request. Please try again.");
                }
              }}
              disabled={reviewRequested}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${
                reviewRequested
                  ? "bg-white/[0.06] text-white/55"
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

      {/* HERO WALLET — 3-card balance breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Available Balance */}
        <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Available Balance</p>
          <h1 className={`mt-2 text-3xl font-bold ${loadingWallet ? "text-white/20 animate-pulse" : "text-white"}`}>
            {loadingWallet ? "$—.——" : formatMoney(wallet?.balance ?? 0)}
          </h1>
          <p className="mt-1 text-xs text-white/40">Total wallet balance</p>
          {/* Floating +$X tip animation */}
          {tipFloat !== null && (
            <span
              key={Date.now()}
              className="absolute right-4 top-4 text-base font-bold text-emerald-400 pointer-events-none"
              style={{ animation: "floatTip 1.5s ease forwards" }}
            >
              +{formatMoney(tipFloat)}
            </span>
          )}
        </div>

        {/* Available Soon */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Available Soon</p>
          <p className={`mt-2 text-3xl font-bold ${loadingWallet ? "text-amber-200/20 animate-pulse" : "text-amber-200"}`}>
            {loadingWallet ? "$—.——" : formatMoney(pendingAmount ?? 0)}
          </p>
          <p className="mt-1 text-xs text-amber-300/70">
            {pendingAvailableOn
              ? `Arrives ${new Date(pendingAvailableOn).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
              : "Processing by Stripe"}
          </p>
        </div>

        {/* Instant / Standard Withdrawal toggle card */}
        <div className="relative rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
              {withdrawCardMode === "instant" ? "Instant Withdrawal" : "Standard Withdrawal"}
            </p>
            {/* 3-dot menu */}
            <div className="relative">
              <button
                onClick={() => setShowWithdrawCardMenu((v) => !v)}
                className="text-white/30 hover:text-white/60 transition p-1 -mt-1 -mr-1 rounded-lg"
                aria-label="Switch withdrawal type"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
                </svg>
              </button>
              {showWithdrawCardMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowWithdrawCardMenu(false)} />
                  <div className="absolute right-0 top-7 z-20 bg-[#0f1623] border border-white/10 rounded-xl shadow-xl w-52 py-1 text-sm">
                    <button
                      className={`w-full text-left px-4 py-2.5 hover:bg-white/5 transition flex items-center gap-2 ${withdrawCardMode === "instant" ? "text-emerald-400 font-medium" : "text-white/70"}`}
                      onClick={() => { setWithdrawCardMode("instant"); localStorage.setItem("dashboard_withdraw_card_mode", "instant"); setShowWithdrawCardMenu(false); }}
                    >
                      <span>⚡</span> Instant <span className="ml-auto text-[11px] text-white/40">5% fee</span>
                    </button>
                    <button
                      className={`w-full text-left px-4 py-2.5 hover:bg-white/5 transition flex items-center gap-2 ${withdrawCardMode === "standard" ? "text-emerald-400 font-medium" : "text-white/70"}`}
                      onClick={() => { setWithdrawCardMode("standard"); localStorage.setItem("dashboard_withdraw_card_mode", "standard"); setShowWithdrawCardMenu(false); }}
                    >
                      <span>🏦</span> Standard <span className="ml-auto text-[11px] text-white/40">3.5% + $0.30</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className={`mt-2 text-3xl font-bold ${loadingWallet ? "text-emerald-400/20 animate-pulse" : "text-emerald-400"}`}>
            {loadingWallet ? "$—.——" : withdrawCardMode === "instant"
              ? formatMoney(instantAvailable ?? 0)
              : formatMoney(getNetWithdrawalAmount(stripeAvailable ?? 0, "standard"))
            }
          </p>
          <p className="mt-1 text-xs text-emerald-300">
            {withdrawCardMode === "instant" ? "⚡ Available now" : "🏦 1–3 business days"}
          </p>
        </div>
      </div>

      {/* Primary actions row */}

      {/* Activate Payouts CTA — shown when Stripe is not connected */}
      {!chargesEnabled && !isClosed && accountStatus !== "restricted" && (
        <div className={`${ui.card} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Activate Payouts</h3>
              <p className="mt-1 text-sm text-white/70">
                Connect your account to start receiving tips and withdrawals.
              </p>
            </div>
            <span className="text-xs bg-amber-500/10 border border-amber-400/20 text-amber-200 px-2.5 py-1 rounded-full">Required</span>
          </div>
          <button
            onClick={() => router.push("/dashboard/onboarding")}
            className={`${ui.btnPrimary} w-full mt-4`}
          >
            Activate Payouts
          </button>
        </div>
      )}

      {/* Earnings + Wallet — grouped side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        {userId && <EarningsCard userId={userId} />}

        <div className={`${ui.card} p-5`}>
          <h3 className="text-sm text-white/50 uppercase tracking-wider font-medium">Wallet</h3>
          <div className="mt-3 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-white/70">Balance</span>
              <span className={`font-semibold ${loadingWallet ? "text-white/20 animate-pulse" : "text-emerald-400"}`}>
                {loadingWallet ? "…" : formatMoney(wallet?.balance ?? 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/70">Fees Paid</span>
              <span className={`text-white font-medium ${loadingWallet ? "animate-pulse" : ""}`}>
                {loadingWallet ? "…" : formatMoney(wallet?.withdraw_fee ?? 0)}
              </span>
            </div>

          </div>
          <button
            onClick={() => router.push("/dashboard/wallet")}
            disabled={isClosed}
            className={`${ui.btnGhost} w-full mt-4 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Manage Wallet →
          </button>
        </div>
      </div>

      {/* Your Link — clean + premium */}
      <div className={`${ui.card} p-6`}>
        <div className="flex items-center justify-between">
          <h2 className={ui.h2}>Your Link</h2>
          {handle ? (
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 px-2.5 py-1 rounded-full">Active</span>
          ) : (
            <span className="text-xs bg-amber-500/10 text-amber-200 border border-amber-400/20 px-2.5 py-1 rounded-full">Set handle</span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between bg-white/5 border border-white/[0.12] rounded-xl px-4 py-3 gap-3">
          <span className="text-sm text-white/80 truncate min-w-0">
            {handle ? fullUrl : "Go to Profile to set your handle"}
          </span>
          <div className="flex gap-2 shrink-0">
            <button onClick={openPreview} disabled={!handle || isClosed} className={`${ui.btnGhost} ${ui.btnSmall} disabled:opacity-40 disabled:cursor-not-allowed`}>
              Open
            </button>
            <button onClick={copy} disabled={!handle || isClosed} className={`${ui.btnPrimary} ${ui.btnSmall} disabled:opacity-40 disabled:cursor-not-allowed`}>
              Copy
            </button>
          </div>
        </div>

        <p className="text-xs text-white/50 mt-2">
          Use this link in your bio, flyers, or anywhere you receive payments.
        </p>
      </div>

      {/* Creator Monetization Card */}
      {isCreator === false && (
        <div className={`${ui.card} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-sm">Monetize with Themes</h3>
              <p className="text-xs text-white/40 mt-0.5">
                {chargesEnabled
                  ? "Sell custom themes to your audience and earn real money."
                  : "Activate payouts first so you can receive earnings from theme sales."}
              </p>
            </div>
            {!chargesEnabled ? (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-blue-400/15 text-blue-300 font-medium">Payout setup required</span>
            ) : creatorApp?.status === "pending" ? (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-400 font-medium">Under Review</span>
            ) : creatorApp?.status === "rejected" ? (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-red-400/15 text-red-400 font-medium">Rejected</span>
            ) : null}
          </div>

          {!chargesEnabled && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-white/50">Complete onboarding first, then you can apply to sell themes.</p>
              <button
                onClick={() => router.push("/dashboard/onboarding")}
                className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition"
              >
                Activate Payouts
              </button>
            </div>
          )}
          {chargesEnabled && creatorApp?.status === "pending" && (
                <p className="mt-3 text-xs text-white/50">Your application is being reviewed. We&apos;ll notify you once a decision is made.</p>
          )}
          {chargesEnabled && creatorApp?.status === "rejected" && (
            <div className="mt-3 space-y-2">
              {creatorApp.review_notes && (
                <p className="text-xs text-white/50 italic">&quot;{creatorApp.review_notes}&quot;</p>
              )}
              <button
                onClick={() => { setApplyForm({ social_links: "", description: "", audience_size: "" }); setApplyState("idle"); setApplyMsg(null); setShowCreatorModal(true); }}
                className="text-xs text-blue-400 hover:underline"
              >
                Reapply →
              </button>
            </div>
          )}
          {chargesEnabled && !creatorApp && (
            <button
              onClick={() => { setApplyForm({ social_links: "", description: "", audience_size: "" }); setApplyState("idle"); setApplyMsg(null); setShowCreatorModal(true); }}
              className="mt-3 px-4 py-2 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition"
            >
              Apply to Become a Creator
            </button>
          )}
        </div>
      )}

      {/* Creator Application Modal */}
      {showCreatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f111a] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5">
            <div>
              <h2 className="text-lg font-bold">Apply to Sell Themes</h2>
              <p className="text-sm text-white/40 mt-1">Tell us about yourself and what you&apos;ll create. We review all applications manually.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Social Links (Instagram, TikTok, etc.)</label>
                <input
                  type="text"
                  placeholder="https://instagram.com/yourhandle"
                  value={applyForm.social_links}
                  onChange={(e) => setApplyForm((f) => ({ ...f, social_links: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">About your work & what you plan to sell <span className="text-red-400">*</span></label>
                <textarea
                  rows={4}
                  placeholder="Describe your creative work, who your audience is, and what kinds of themes you'd like to offer..."
                  value={applyForm.description}
                  onChange={(e) => setApplyForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Approximate Audience Size</label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  min="0"
                  value={applyForm.audience_size}
                  onChange={(e) => setApplyForm((f) => ({ ...f, audience_size: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none"
                />
              </div>
            </div>

            {applyMsg && (
              <p className={`text-sm ${applyState === "error" ? "text-red-400" : "text-emerald-400"}`}>{applyMsg}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={submitApplication}
                disabled={applyState === "loading" || applyState === "success"}
                className="flex-1 py-2.5 bg-white text-black font-semibold text-sm rounded-xl hover:bg-white/90 transition disabled:opacity-40"
              >
                {applyState === "loading" ? "Submitting…" : applyState === "success" ? "Submitted!" : "Submit Application"}
              </button>
              <button
                onClick={() => setShowCreatorModal(false)}
                className="px-4 py-2.5 bg-white/10 text-white/60 text-sm rounded-xl hover:bg-white/15 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share tools */}
      <div className={`${ui.card} p-6`}>
        <h2 className={ui.h2}>Share</h2>
        <p className="mt-1 text-sm text-white/70">Download QR codes and share your link anywhere.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className={`${ui.btnGhost} ${ui.btnSmall}`} href="/dashboard/share">Go to Share</Link>
          <Link className={`${ui.btnGhost} ${ui.btnSmall}`} href="/dashboard/profile">Edit Profile</Link>
        </div>
      </div>
    </div>
  );
}
