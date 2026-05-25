"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import EmailChangeCard from "@/components/EmailChangeCard";

type ProfileData = {
  account_status: string | null;
  status_reason: string | null;
  restricted_until: string | null;
  restriction_count: number | null;
  kyc_status: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  email: string | null;
  handle: string | null;
  display_name: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_onboarding_complete: boolean | null;
};

const STATUS_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  active:           { label: "Active",     color: "text-emerald-400", icon: "🟢" },
  restricted:       { label: "Restricted", color: "text-red-400",     icon: "🔴" },
  suspended:        { label: "Suspended",  color: "text-amber-400",   icon: "🟡" },
  closed:           { label: "Closed",     color: "text-white/55",    icon: "⚫" },
  closed_finalized: { label: "Closed",     color: "text-white/45",    icon: "⚫" },
};

function AccountContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("account_status, status_reason, restricted_until, restriction_count, kyc_status, is_verified, created_at, email, handle, display_name, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete")
        .eq("user_id", userRes.user.id)
        .maybeSingle();

      setProfile(prof as ProfileData | null);
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const status = profile.account_status ?? "active";
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.active;
  const reason = profile.status_reason;

  // Stripe-side health: charges or payouts disabled means the payout account needs attention.
  // Only flag this when onboarding has been attempted (stripe_onboarding_complete is non-null).
  const stripeOnboarded = profile.stripe_onboarding_complete !== null;
  const stripeHealthy =
    !stripeOnboarded ||
    (profile.stripe_charges_enabled === true && profile.stripe_payouts_enabled === true);
  const stripeNeedsAction = stripeOnboarded && !stripeHealthy;

  // Overall health: unhealthy if either platform status OR Stripe is restricted.
  const overallHealthy = status === "active" && stripeHealthy;

  // Format restricted_until as readable duration
  const restrictedUntilLabel = profile.restricted_until
    ? new Date(profile.restricted_until).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-lg mx-auto space-y-6 account-enter">
      <h1 className={ui.h2}>Account</h1>

      {/* Hero Status Banner */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/[0.12] shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider">Account Health</p>
            <p className="text-lg font-semibold mt-1">
              {overallHealthy ? "Everything looks good" : "Action required"}
            </p>
          </div>
          <div className={`text-sm px-3 py-1.5 rounded-full ${
            status === "active"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}>
            {display.label}
          </div>
        </div>

        {/* Stripe payout account health — separate from platform account_status */}
        {stripeOnboarded && (
          <div className={`flex items-center justify-between text-sm pt-1 border-t ${
            stripeNeedsAction ? "border-amber-500/20" : "border-white/[0.08]"
          }`}>
            <span className="text-white/50">Payout account</span>
            {stripeNeedsAction ? (
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-medium">
                  {!profile.stripe_charges_enabled && !profile.stripe_payouts_enabled
                    ? "Charges & payouts disabled"
                    : !profile.stripe_charges_enabled
                    ? "Charges disabled"
                    : "Payouts disabled"}
                </span>
              </div>
            ) : (
              <span className="text-emerald-400 font-medium">Active</span>
            )}
          </div>
        )}
      </div>

      {/* Account Status Card */}
      <div className={`${ui.card} account-card rounded-2xl backdrop-blur-xl border border-white/[0.12] p-5 space-y-3`}>
        <p className={`text-xs font-medium uppercase tracking-wider ${ui.muted}`}>Account Status</p>

        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className={`absolute h-3 w-3 rounded-full ${display.color.replace("text", "bg")} opacity-30 blur-md`} />
            <span className={`h-2.5 w-2.5 rounded-full ${display.color.replace("text", "bg")} status-dot`} />
          </div>
          <span className={`text-xl font-semibold ${display.color}`}>
            {display.label}
          </span>
        </div>

        {/* Reason */}
        {status !== "active" && (
          <p className={`text-sm ${ui.muted}`}>
            {reason || "There is an issue with your account."}
          </p>
        )}

        {/* Restricted until */}
        {status === "restricted" && restrictedUntilLabel && (
          <p className="text-xs text-red-400/70">
            Restricted until: {restrictedUntilLabel}
          </p>
        )}

        {status === "restricted" && !restrictedUntilLabel && (
          <p className="text-xs text-red-400/70">
            Restricted until further review.
          </p>
        )}

        {/* Actions per status */}
        {status === "restricted" && (
          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/dashboard/account/verify"
              className="text-sm font-medium px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition active:scale-[0.97]"
            >
              Verify Identity
            </Link>
            <Link
              href="/dashboard/support"
              className={`text-sm font-medium ${ui.muted} hover:text-white underline underline-offset-2 transition`}
            >
              Contact Support
            </Link>
          </div>
        )}

        {status === "suspended" && (
          <div className="pt-2">
            <Link
              href="/dashboard/support"
              className="text-sm font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2 transition"
            >
              Contact Support to resolve →
            </Link>
          </div>
        )}

        {status === "closed" && (
          <p className={`text-xs ${ui.muted2} pt-1`}>
            You can still withdraw your remaining balance from the{" "}
            <Link href="/dashboard/wallet" className="underline hover:text-white transition">
              Wallet
            </Link>.
          </p>
        )}

        {status === "active" && profile.is_verified && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-emerald-400 text-sm font-semibold">✔ Verified</span>
            <span className={`text-xs ${ui.muted2}`}>Identity confirmed</span>
          </div>
        )}

        {status === "active" && !profile.is_verified && (
          <p className={`text-xs ${ui.muted2}`}>
            Your account is in good standing. No action required.
          </p>
        )}
      </div>

      {/* Verification Status Card */}
      <div className={`${ui.card} account-card rounded-2xl backdrop-blur-xl border border-white/[0.12] p-5 space-y-2`}>
        <p className="text-xs font-medium uppercase tracking-wider text-white/55">Identity Verification</p>
        <div className="flex items-center gap-2">
          {(!profile.kyc_status || profile.kyc_status === "none") && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-gray-500" />
              <span className="text-white/55 font-semibold text-sm">Not Started</span>
            </>
          )}
          {profile.kyc_status === "pending" && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 font-semibold text-sm">Pending Review</span>
            </>
          )}
          {profile.kyc_status === "approved" && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-semibold text-sm">Verified ✔</span>
            </>
          )}
          {profile.kyc_status === "rejected" && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="text-red-400 font-semibold text-sm">Not Approved</span>
            </>
          )}
        </div>
        {(!profile.kyc_status || profile.kyc_status === "none") && (
          <Link
            href="/dashboard/account/verify"
            className={`inline-block text-sm ${ui.muted} hover:text-white underline underline-offset-2 transition`}
          >
            Verify your identity →
          </Link>
        )}
        {profile.kyc_status === "rejected" && (
          <Link
            href="/dashboard/account/verify"
            className={`inline-block text-sm ${ui.muted} hover:text-white underline underline-offset-2 transition`}
          >
            Submit new document →
          </Link>
        )}
        {profile.kyc_status === "pending" && (
          <p className={`text-xs ${ui.muted2}`}>
            We&apos;re reviewing your document. You&apos;ll be notified once it&apos;s processed.
          </p>
        )}
        {profile.kyc_status === "approved" && (
          <>
            <p className={`text-xs ${ui.muted2}`}>
              Your identity has been confirmed. Full account access enabled.
            </p>
            <div className="mt-2 text-xs text-emerald-400 animate-pulse">
              ✔ Full access unlocked
            </div>
          </>
        )}
      </div>

      {/* Quick Links */}
      <div className={`${ui.card} account-card rounded-2xl backdrop-blur-xl border border-white/[0.12] p-5 space-y-1`}>
        <p className="text-xs font-medium uppercase tracking-wider text-white/55 mb-3">Quick Links</p>

        <Link
          href="/dashboard/wallet"
          className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/10 transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">💳</span>
            <span className="text-sm">Wallet & Payouts</span>
          </div>
          <span className="text-white/45">→</span>
        </Link>
        <Link
          href="/dashboard/settings"
          className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/10 transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🔐</span>
            <span className="text-sm">Security & Settings</span>
          </div>
          <span className="text-white/45">→</span>
        </Link>
        <Link
          href="/dashboard/profile"
          className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/10 transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">👤</span>
            <span className="text-sm">Edit Profile</span>
          </div>
          <span className="text-white/45">→</span>
        </Link>
        <Link
          href="/dashboard/support"
          className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/10 transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">📄</span>
            <span className="text-sm">Help & Support</span>
          </div>
          <span className="text-white/45">→</span>
        </Link>
        <Link
          href="/dashboard/account/violations"
          className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/10 transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <span className="text-sm">Account Violations</span>
          </div>
          <span className="text-white/45">→</span>
        </Link>
      </div>

      {/* Email Change Card */}
      <EmailChangeCard currentEmail={profile.email} />

      {/* Account Info */}
      <div className={`${ui.card} account-card rounded-2xl backdrop-blur-xl border border-white/[0.12] p-5`}>
        <p className="text-xs font-medium uppercase tracking-wider text-white/55 mb-3">Account Info</p>
        <dl className="text-sm">
          {profile.display_name && (
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <dt className={ui.muted}>Name</dt>
              <dd>{profile.display_name}</dd>
            </div>
          )}
          {profile.handle && (
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <dt className={ui.muted}>Handle</dt>
              <dd>@{profile.handle}</dd>
            </div>
          )}
          {profile.email && (
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <dt className={ui.muted}>Email</dt>
              <dd>{profile.email}</dd>
            </div>
          )}
          {memberSince && (
            <div className="flex justify-between items-center py-2">
              <dt className={ui.muted}>Member since</dt>
              <dd>{memberSince}</dd>
            </div>
          )}
        </dl>
      </div>

    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <AccountContent />
    </Suspense>
  );
}
