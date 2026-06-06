import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { getWithdrawalFee, getNetWithdrawalAmount, PLATFORM_INSTANT_FEE_RATE } from "@/lib/walletFees";
import { validateWithdrawal } from "@/lib/withdrawalRules";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import { checkSoftRestrictions } from "@/lib/softRestrictions";
import { calculateTrustScore, type TrustInput } from "@/lib/trustScore";
import { shouldAutoFreeze, executeAutoFreeze, type FreezeContext } from "@/lib/autoFreeze";
import { hasSuspiciousLogins, generateDeviceHash } from "@/lib/loginTracker";
import { logFraudSignal, createFraudCase } from "@/lib/fraudSignals";
import { logCaughtError } from "@/lib/errorLogger";
import { sendWithdrawalSuccess } from "@/lib/email/sendWithdrawalSuccess";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sendAdminAlert } from "@/lib/adminAlerts";
import { triggerAIAlerts } from "@/lib/ai/alerts";
import { determineTrustTier, TRUST_TIER_POLICIES } from "@/lib/payoutTrustTier";
import { evaluateIpReputation } from "@/lib/ipReputation";
import { getCreatorCategoryByName } from "@/lib/creatorCategoriesServer";
import { emitSecurityEvent } from "@/lib/security-event";
import type { ProfileRow } from "@/types/db";

export const runtime = "nodejs";

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => Number((n / 100).toFixed(2));

export async function POST(req: Request) {
  let lockUserId: string | null = null;
  try {
    const { amount, destination, payout_type } = await req.json();
    const amt = Number(amount);
    const payoutType: "instant" | "standard" = payout_type === "standard" ? "standard" : "instant";

    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Validate destination if provided (must be a Stripe external account ID)
    const payoutDestination = (typeof destination === "string" && (destination.startsWith("ba_") || destination.startsWith("card_")))
      ? destination
      : undefined;

    // Use the caller's Supabase JWT
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

    // Validate user via anon client + JWT
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userRes.user.id;
    lockUserId = userId;
    const clientIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || "";
    const currentDeviceHash = generateDeviceHash(clientIp, userAgent);

    // Require verified email for withdrawals
    try {
      await requireVerifiedEmail(userId);
    } catch {
      return NextResponse.json({ error: "Please verify your email before withdrawing" }, { status: 403 });
    }

    // Rate limit: 3 withdrawals per 5 minutes per user
    const { allowed: rateLimitOk } = await rateLimit(`withdraw:${userId}`, 3, 300);
    if (!rateLimitOk) {
      return NextResponse.json({ error: "Too many withdrawal attempts. Please wait." }, { status: 429 });
    }

    // Enforce wallet 2FA server-side — wallet must be unlocked within the last 30 minutes
    const WALLET_UNLOCK_WINDOW_MS = 30 * 60 * 1000;
    const { data: twoFaCheck } = await supabaseAdmin
      .from("profiles")
      .select("wallet_2fa_enabled, wallet_unlocked_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (twoFaCheck?.wallet_2fa_enabled) {
      const unlockedAt = twoFaCheck.wallet_unlocked_at
        ? new Date(twoFaCheck.wallet_unlocked_at).getTime()
        : 0;
      if (Date.now() - unlockedAt > WALLET_UNLOCK_WINDOW_MS) {
        return NextResponse.json(
          { error: "Wallet locked. Please unlock your wallet first." },
          { status: 403 }
        );
      }
    }

    // Check fraud-based soft restrictions
    const restriction = await checkSoftRestrictions(userId);
    if (restriction.blocked) {
      return NextResponse.json({ error: restriction.reason }, { status: 403 });
    }

    // Flag (not block) suspicious login patterns + optional IP reputation
    // signals — both feed trust scoring and can increase payout delay.
    const [suspiciousLogins, ipReputation] = await Promise.all([
      hasSuspiciousLogins(userId),
      evaluateIpReputation(clientIp),
    ]);

    // Load profile (Stripe status + account state)
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_payouts_enabled, is_flagged, created_at, account_status, payout_hold_until, daily_withdrawn, restricted_until, total_volume, last_ip, creator_activity_category, stripe_restriction_state, stripe_disabled_reason")
      .eq("user_id", userId)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) return NextResponse.json({ error: "Withdrawal failed. Please try again." }, { status: 500 });

    const creatorCategory = await getCreatorCategoryByName(prof?.creator_activity_category ?? null);

    // Acquire wallet lock EARLY to prevent concurrent withdrawal races
    const lock = await acquireWalletLock(supabaseAdmin, userId, "withdrawal", 300);
    if (!lock.ok) {
      return NextResponse.json({ error: "Withdrawal already in progress" }, { status: 409 });
    }

    // Fetch wallet balance under lock (prevents double-spend)
    const { data: walletRow, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletErr) {
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Withdrawal failed. Please try again." }, { status: 500 });
    }

    let balance = Number((walletRow?.balance ?? 0) || 0);

    // If the ledger wallet is empty but the user has a Stripe connected account,
    // fall back to the live Stripe available balance — same as the display API.
    // This handles cases where tip webhooks were missed and the ledger was never
    // seeded. We read Stripe here (before the balance check) so the user is not
    // blocked from withdrawing money that is genuinely in their account.
    // The Stripe balance is re-verified later in the payout guard anyway.
    if (balance === 0 && prof?.stripe_account_id) {
      try {
        const liveBal = await stripe.balance.retrieve({}, { stripeAccount: prof.stripe_account_id });
        const liveAvailable = (liveBal.available ?? [])
          .filter((b) => b.currency === "usd")
          .reduce((sum, b) => sum + b.amount, 0) / 100;
        const livePending = (liveBal.pending ?? [])
          .filter((b) => b.currency === "usd")
          .reduce((sum, b) => sum + b.amount, 0) / 100;
        const liveTotal = liveAvailable + livePending;
        if (liveTotal > 0) {
          balance = liveTotal;
          // Seed the ledger so the wallet balance is consistent going forward.
          // Idempotency: only insert if no prior seeding entry exists.
          const { data: seedExists } = await supabaseAdmin
            .from("transactions_ledger")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "deposit")
            .like("reference_id", "stripe_seed_%")
            .maybeSingle();
          if (!seedExists) {
            const { addLedgerEntry: addEntry } = await import("@/lib/ledger");
            await addEntry({
              user_id: userId,
              type: "deposit",
              amount: liveTotal,
              reference_id: `stripe_seed_${prof.stripe_account_id}`,
              meta: {
                action: "stripe_seed",
                reason: "wallet ledger empty — seeded from live Stripe balance before withdrawal",
                stripe_available: liveAvailable,
                stripe_pending: livePending,
                seeded_at: new Date().toISOString(),
              },
            });
          }
        }
      } catch (e) {
        // Non-fatal — proceed with balance=0; the payout guard below will block if Stripe is empty
        console.warn("[withdrawal] Stripe balance seed fetch failed:", e instanceof Error ? e.message : e);
      }
    }

    // Re-fetch daily_withdrawn under lock to prevent stale-read bypass of daily limit
    {
      const { data: freshProfile } = await supabaseAdmin
        .from("profiles")
        .select("daily_withdrawn")
        .eq("user_id", userId)
        .maybeSingle();
      if (prof && freshProfile) {
        prof.daily_withdrawn = freshProfile.daily_withdrawn;
      }
    }

    // Run state-driven withdrawal safety rules
    if (prof) {
      const check = validateWithdrawal(prof, amt, balance) as { ok: boolean; reason?: string; expired_restriction?: boolean };
      if (!check.ok) {
        try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
        return NextResponse.json({ error: check.reason }, { status: 400 });
      }
      // Auto-unlock expired restriction
      if (check.expired_restriction) {
        await supabaseAdmin
          .from("profiles")
          .update({ account_status: "active", restricted_until: null, status_reason: null })
          .eq("user_id", userId);
      }
    }

    if (!prof?.stripe_account_id) {
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Stripe not connected" }, { status: 400 });
    }
    if (!prof.stripe_payouts_enabled) {
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Payouts not enabled" }, { status: 400 });
    }

    // Block withdrawals for accounts younger than 24 hours
    const accountAgeMs = Date.now() - new Date(prof.created_at ?? 0).getTime();
    if (accountAgeMs < 24 * 60 * 60 * 1000) {
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Withdrawals are available 24 hours after account creation" }, { status: 403 });
    }

    const stripeAccount = prof.stripe_account_id;

    // Closed accounts can only withdraw — but must have a balance to do so
    if (prof?.account_status === "closed" && balance <= 0) {
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "No balance remaining" }, { status: 400 });
    }

    // Block withdrawal if pending refunds (initiated within last 10 min) would push balance negative
    const initiatedCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: pendingRefunds } = await supabaseAdmin
      .from("tip_intents")
      .select("tip_amount, refunded_amount")
      .eq("creator_user_id", userId)
      .eq("refund_status", "initiated")
      .or(`refund_initiated_at.gte.${initiatedCutoff},refund_initiated_at.is.null`);

    const pendingRefundTotal = (pendingRefunds ?? []).reduce((sum, t) => {
      const owed = Number(t.tip_amount ?? 0) - Number(t.refunded_amount ?? 0);
      return sum + Math.max(0, owed);
    }, 0);

    if (balance - amt < pendingRefundTotal) {
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json(
        { error: `Withdrawal blocked: $${pendingRefundTotal.toFixed(2)} in pending refunds must be covered by remaining balance` },
        { status: 409 }
      );
    }

    if (amt > balance) {
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // Also check connected Stripe account balance as a secondary guard.
    // Expand net_available so the instant-payout ceiling is exact.
    const bal = await stripe.balance.retrieve(
      { expand: ["instant_available.net_available"] },
      { stripeAccount }
    );
    const availableUsdCents =
      (bal.available || [])
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + (b.amount || 0), 0);

    // net_available = max payout amount (bank-receive) Stripe will approve for instant.
    // Stripe charges its fee ON TOP of the payout, so we must check netCents ≤ this.
    let stripeInstantNetCents = 0;
    for (const entry of (bal as any).instant_available ?? []) {
      if (entry.currency !== "usd") continue;
      const nets: { amount: number }[] = entry.net_available ?? [];
      if (nets.length > 0) {
        stripeInstantNetCents += nets.reduce((s: number, d: { amount: number }) => s + (d.amount ?? 0), 0);
      } else {
        stripeInstantNetCents += entry.amount ?? 0; // fallback to gross
      }
    }

    const reqCents = toCents(amt);

    // For instant payouts Stripe advances pending funds — the relevant ceiling is
    // stripeInstantNetCents (net_available: max payout Stripe will approve),
    // not the standard availableUsdCents.  Only block with the pending-funds
    // error for standard payouts (or when amount exceeds the instant ceiling too).
    const isInstantEligibleByStripe = payoutType === "instant" && reqCents <= stripeInstantNetCents;

    if (reqCents > availableUsdCents && !isInstantEligibleByStripe) {
      // Check if funds exist but are still pending settlement in Stripe
      const pendingUsdCents =
        (bal.pending || [])
          .filter((b) => b.currency === "usd")
          .reduce((sum, b) => sum + (b.amount || 0), 0);

      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}

      if (pendingUsdCents >= reqCents) {
        // Funds are in Stripe but not yet settled — give a specific time-based message
        return NextResponse.json(
          {
            error: `Your $${fromCents(pendingUsdCents).toFixed(2)} in earnings is still processing with our payment provider. Funds typically settle within 2–3 business days of receiving a tip. Please try again in 1–2 days.`,
            pending_cents: pendingUsdCents,
          },
          { status: 400 }
        );
      }

      if (pendingUsdCents > 0) {
        // Partial pending — some funds not yet settled
        return NextResponse.json(
          {
            error: `Only $${fromCents(availableUsdCents).toFixed(2)} of your balance is currently available for withdrawal. $${fromCents(pendingUsdCents).toFixed(2)} is still processing and should be available within 1–2 business days.`,
            available_cents: availableUsdCents,
            pending_cents: pendingUsdCents,
          },
          { status: 400 }
        );
      }

      // No pending balance either — rare, could be a reconciliation issue
      return NextResponse.json(
        { error: "Payout temporarily unavailable. Please contact support if this persists." },
        { status: 400 }
      );
    }

    // ── Trust score calculation ──────────────────────────────────
    const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));

    // Gather trust signals from DB (parallel queries)
    const [payoutsRes, chargebackRes, avgRes, baselineRes, anomalyRes] = await Promise.all([
      supabaseAdmin
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "paid"),
      supabaseAdmin
        .from("fraud_anomalies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("type", ["chargeback", "dispute"])
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin
        .from("withdrawals")
        .select("amount")
        .eq("user_id", userId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("user_baselines")
        .select("avg_withdrawal, avg_daily_volume, last_7d_volume, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("ledger_anomalies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("detected_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const successfulPayouts = payoutsRes.count ?? 0;
    const chargebackCount30d = chargebackRes.count ?? 0;
    const recentChargeback7d = chargebackCount30d > 0; // Used for auto-freeze (7-day signal)
    const baseline = baselineRes.data;
    const ledgerAnomalyCount = anomalyRes.count ?? 0;

    const pastAmounts = (avgRes.data ?? []).map((r) => Number(r.amount || 0));
    const avgPayout = pastAmounts.length > 0
      ? pastAmounts.reduce((s, a) => s + a, 0) / pastAmounts.length
      : 0;
    // Use baseline avg if available (90-day window), else fall back to last-10 average
    const baselineAvg = Number(baseline?.avg_withdrawal ?? 0);
    const effectiveAvg = baselineAvg > 0 ? baselineAvg : avgPayout;
    const largeWithdrawal = effectiveAvg > 0 && amt > effectiveAvg * 2;

    // Detect activity spike: current 7d volume is 5× the daily average (tuned to avoid flagging viral creators)
    const activitySpike = baseline
      ? Number(baseline.last_7d_volume ?? 0) > Number(baseline.avg_daily_volume ?? 0) * 7 * 5
      : false;

    // ── Rapid-fire detection (before trust score) ─────────────
    // Uses behavior-based detection: count + tip→withdraw loops, not amounts
    const { data: rapidFireData } = await supabaseAdmin
      .rpc("detect_rapid_fire", { p_user_id: userId });

    const rapidFire = rapidFireData as {
      wd_count_30m: number;
      wd_count_10m: number;
      loop_count: number;
      is_rapid: boolean;
      is_loop: boolean;
    } | null;

    const isRapidPattern = rapidFire?.is_rapid ?? false;
    const isLoopPattern = rapidFire?.is_loop ?? false;

    // ── Device/IP + multi-account signals ─────────────────────
    const lookback24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [knownDeviceRes, sharedDeviceRes, sharedIpRes] = await Promise.all([
      supabaseAdmin
        .from("trusted_devices")
        .select("id")
        .eq("user_id", userId)
        .eq("device_hash", currentDeviceHash)
        .maybeSingle(),
      supabaseAdmin
        .from("trusted_devices")
        .select("user_id", { count: "exact", head: true })
        .eq("device_hash", currentDeviceHash)
        .neq("user_id", userId),
      clientIp !== "unknown"
        ? supabaseAdmin
            .from("login_logs")
            .select("user_id", { count: "exact", head: true })
            .eq("ip_address", clientIp)
            .eq("success", true)
            .neq("user_id", userId)
            .gte("created_at", lookback24h)
        : Promise.resolve({ count: 0 } as any),
    ]);

    const knownDevice = Boolean(knownDeviceRes.data);
    const newDeviceSignal = userAgent.length > 0 ? !knownDevice : false;
    const sameDeviceSignal = !newDeviceSignal;
    const newIpSignal =
      (clientIp !== "unknown" && !!prof?.last_ip && prof.last_ip !== clientIp) ||
      suspiciousLogins ||
      ipReputation.highRisk;

    const sharedDeviceSignal = (sharedDeviceRes.count ?? 0) > 0;
    const sharedIpSignal = (sharedIpRes?.count ?? 0) > 0;
    const multiAccountSignal = sharedDeviceSignal || (sharedIpSignal && suspiciousLogins);

    const trustInput: TrustInput = {
      account_age_days: accountAgeDays,
      successful_payouts: successfulPayouts,
      chargeback_count_30d: chargebackCount30d,
      consistent_activity: accountAgeDays >= 7, // simplified: active 7+ days
      same_device: sameDeviceSignal,
      stripe_verified: !!prof.stripe_payouts_enabled,
      new_device: newDeviceSignal,
      new_ip: newIpSignal,
      large_withdrawal: largeWithdrawal,
      activity_spike: activitySpike,
      recent_chargeback: recentChargeback7d,
      multi_account_flag: multiAccountSignal,
      is_flagged: !!prof.is_flagged,
      total_volume: Number(prof.total_volume ?? 0),
      ledger_anomaly_count: ledgerAnomalyCount,
      rapid_fire: isRapidPattern || isLoopPattern,
    };

    const trust = calculateTrustScore(trustInput);
    const trustTier = determineTrustTier({
      successfulPayouts,
      trustScore: trust.score,
      riskLevel: trust.risk,
    });
    const trustTierPolicy = TRUST_TIER_POLICIES[trustTier];
    const categoryDelayFloor = Math.max(0, Number(creatorCategory?.payout_delay_days ?? 0));
    const effectiveDelayDays = Math.max(trustTierPolicy.payoutDelayDays, categoryDelayFloor);
    const effectiveInstantEligible = trustTierPolicy.instantEligible && effectiveDelayDays === 0;
    const categoryRisk = creatorCategory?.risk_level || "low";
    const categoryNeedsManualReview = Boolean(creatorCategory?.requires_manual_review);

    // ── Auto-freeze check ─────────────────────────────────────
    const freezeCtx: FreezeContext = {
      userId,
      trust_score: trust.score,
      recent_chargeback: recentChargeback7d,
      multi_account_flag: multiAccountSignal,
      rapid_withdrawals: isRapidPattern || isLoopPattern,
      activity_spike: activitySpike,
      tip_withdraw_loop: isLoopPattern,
      new_device: newDeviceSignal,
      new_ip: newIpSignal,
    };

    const freezeResult = shouldAutoFreeze(freezeCtx);
    if (freezeResult) {
      await executeAutoFreeze(userId, freezeResult.reason, freezeResult.level, freezeResult.signals);
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json(
        { error: "Account frozen due to suspicious activity", reason: freezeResult.reason },
        { status: 403 }
      );
    }

    // HIGH risk → block + admin review
    if (trust.risk === "high") {
      // Still create the withdrawal row so admin can see it
      await supabaseAdmin.from("withdrawals").insert({
        user_id: userId,
        amount: amt,
        fee: 0,
        net: amt,
        status: "under_review",
        risk_score: trust.score,
        risk_level: trust.risk,
        trust_tier: trustTier,
        trust_tier_label: trustTierPolicy.label,
        payout_delay_days: effectiveDelayDays,
        instant_eligible: effectiveInstantEligible,
        payout_policy_reason: `High-risk withdrawal sent to manual review (${creatorCategory?.name || "uncategorized"}, ${categoryRisk})`,
      });

      // Update profile trust score
      await supabaseAdmin
        .from("profiles")
        .update({ trust_score: trust.score, risk_level: trust.risk, last_risk_check: new Date().toISOString() })
        .eq("user_id", userId);

      // Create fraud case and log signals for admin pipeline
      await createFraudCase(userId, trust.score, trust.risk, trust.reasons, "withdrawal");
      await logFraudSignal(userId, "high_risk_withdrawal", trust.score, {
        amount: amt,
        reasons: trust.reasons,
        ledger_anomalies: ledgerAnomalyCount,
      });

      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json(
        { error: "Withdrawal under review", risk_level: trust.risk, reasons: trust.reasons },
        { status: 403 }
      );
    }

    // ── Explicit trust-tier payout policy (Phase 4) ───────────
    // New: 7 days, Verified: 3 days, Trusted: daily, Established: instant eligible.
    // ── Payout decision model ──────────────────────────────────
    let withdrawalStatus: string;
    let releaseAt: string | null = null;
    let payoutPolicyReason = "";

    const manualReviewSignal =
      categoryNeedsManualReview &&
      (largeWithdrawal || ipReputation.highRisk || multiAccountSignal || isRapidPattern || isLoopPattern);

    // Risk override: rapid-fire behavior bypasses tier schedule.
    if (manualReviewSignal) {
      withdrawalStatus = "under_review";
      payoutPolicyReason = `Category review rule (${creatorCategory?.name || "uncategorized"})`;
    } else if (isRapidPattern || isLoopPattern) {
      const delayMinutes = 30 + Math.floor(Math.random() * 31);
      releaseAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
      withdrawalStatus = "pending";
      payoutPolicyReason = "Rapid activity risk override";
    } else if (ipReputation.highRisk) {
      const delayMinutes = 30 + Math.floor(Math.random() * 31);
      releaseAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
      withdrawalStatus = "pending";
      payoutPolicyReason = `IP reputation risk override (${ipReputation.provider})`;
    } else if (effectiveInstantEligible) {
      withdrawalStatus = "approved";
      payoutPolicyReason = `${trustTierPolicy.label} tier instant eligible`;
    } else {
      releaseAt = new Date(Date.now() + effectiveDelayDays * 24 * 60 * 60 * 1000).toISOString();
      withdrawalStatus = "pending";
      payoutPolicyReason = `${trustTierPolicy.label} tier ${effectiveDelayDays}-day policy`;
    }

    if (creatorCategory?.name) {
      payoutPolicyReason = `${payoutPolicyReason} • Category: ${creatorCategory.name} (${categoryRisk})`;
    }

    // Compute fee + net.
    // Platform fee (instant only): 5% of the payout amount, taken from the
    // connected account balance AFTER the payout — user gets exactly amt.
    // Standard withdrawals: no platform fee.
    const platformFee = payoutType === "instant"
      ? Math.round(amt * PLATFORM_INSTANT_FEE_RATE * 100) / 100
      : 0;
    const withdrawalFee = platformFee; // stored on the withdrawal row for accounting
    const netAmount = amt;             // user receives exactly what they requested

    // Create withdrawal row first
    const { data: w, error: wErr } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount: amt,
        fee: withdrawalFee,
        net: netAmount,
        status: withdrawalStatus,
        risk_score: trust.score,
        risk_level: trust.risk,
        trust_tier: trustTier,
        trust_tier_label: trustTierPolicy.label,
        payout_delay_days: effectiveDelayDays,
        instant_eligible: effectiveInstantEligible,
        payout_policy_reason: payoutPolicyReason,
        release_at: releaseAt,
        ...(payoutDestination ? { payout_destination: payoutDestination } : {}),
      })
      .select("id")
      .single();

    // Update profile trust score
    await supabaseAdmin
      .from("profiles")
      .update({ trust_score: trust.score, risk_level: trust.risk, last_risk_check: new Date().toISOString() })
      .eq("user_id", userId);

    if (wErr) {
      // release lock on failure to create row
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Withdrawal failed. Please try again." }, { status: 500 });
    }

    // Log withdrawal to ledger (debit)
    try {
      await addLedgerEntry({
        user_id: userId,
        type: "withdrawal",
        amount: Number((-amt).toFixed(2)),
        reference_id: w.id,
        meta: {
          action: "withdrawal",
          method: payoutType,
          fee: withdrawalFee,
          net: netAmount,
          currency: "usd",
          trust_tier: trustTier,
          trust_tier_label: trustTierPolicy.label,
          creator_category: creatorCategory?.name || null,
          creator_category_risk: categoryRisk,
          payout_policy_reason: payoutPolicyReason,
        },
        status: "processing",
      });
    } catch (err: unknown) {
      // Attempt to rollback withdrawal row if ledger logging fails
      try { await supabaseAdmin.from("withdrawals").delete().eq("id", w.id); } catch (e) {}
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Failed to log ledger entry" }, { status: 500 });
    }

    // ── Payout execution ──────────────────────────────────────
    // Only trigger the Stripe payout immediately for "approved" withdrawals.
    // "pending" withdrawals are held until release_at — the release-payouts cron handles them.
    if (withdrawalStatus === "approved") {
      const payoutMethod = payoutType;
      let payout;

      const netCents = toCents(netAmount);

      // For instant payouts: verify the requested amount is within Stripe's
      // net_available ceiling.  The user receives exactly what they request;
      // Stripe deducts its own fee from the connected account balance on top.
      if (payoutType === "instant" && netCents > stripeInstantNetCents) {
        // Reverse the already-recorded ledger debit and mark the withdrawal failed
        try {
          await addLedgerEntry({
            user_id: userId,
            type: "withdrawal_reversal",
            amount: Number(amt.toFixed(2)),
            reference_id: w.id,
            meta: { action: "withdrawal_reversal", reason: "instant_unavailable" },
          });
        } catch (_) {}
        try {
          await supabaseAdmin.from("withdrawals").update({ status: "failed", failure_reason: "instant_unavailable" }).eq("id", w.id);
        } catch (_) {}
        try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
        return NextResponse.json(
          {
            error: `Only $${fromCents(stripeInstantNetCents).toFixed(2)} of your balance is available for instant withdrawal. The remaining balance is still settling (typically 2–3 business days).`,
            instant_available_cents: stripeInstantNetCents,
            available_cents: availableUsdCents,
          },
          { status: 400 }
        );
      }

      try {
        payout = await stripe.payouts.create(
          {
            amount: netCents,
            currency: "usd",
            ...(payoutType === "instant" ? { method: "instant" } : {}),
            statement_descriptor: "1NELINK PAYOUT",
            metadata: { withdrawal_id: w.id, user_id: userId },
            ...(payoutDestination ? { destination: payoutDestination } : {}),
          },
          { stripeAccount }
        );
      } catch (err: unknown) {
        // If instant payout fails, REVERSE the ledger debit and mark withdrawal failed
        const payoutErr = err instanceof Error ? err.message : String(err ?? "Instant payout failed");
        console.error("Stripe payout failed:", payoutErr);

        sendAdminAlert({
          subject: "Stripe payout failed",
          body: `Instant payout failed for user ${userId}. Amount: $${amt.toFixed(2)}. The ledger debit has been reversed.`,
          severity: "critical",
          meta: { user_id: userId, amount: amt.toFixed(2), error: payoutErr, withdrawal_id: w.id },
        });

        // Reverse ledger debit (credit back the amount)
        try {
          await addLedgerEntry({
            user_id: userId,
            type: "withdrawal_reversal",
            amount: Number(amt.toFixed(2)),
            reference_id: w.id,
            meta: { action: "withdrawal_reversal", reason: "payout_failed", error: payoutErr },
          });
        } catch (reverseErr) {
          console.error("CRITICAL: Failed to reverse ledger debit after payout failure:", reverseErr);
          sendAdminAlert({
            subject: "CRITICAL: Ledger reversal failed",
            body: `Failed to reverse ledger debit after payout failure. User may have incorrect balance. MANUAL INTERVENTION REQUIRED.`,
            severity: "critical",
            meta: { user_id: userId, amount: amt.toFixed(2), withdrawal_id: w.id, error: String(reverseErr) },
          });
        }

        // Mark withdrawal as failed
        try {
          await supabaseAdmin
            .from("withdrawals")
            .update({ status: "failed", failure_reason: payoutErr })
            .eq("id", w.id);
        } catch (_) {}

        void triggerAIAlerts("withdrawals.create:payout_failed");

        try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
        return NextResponse.json({ error: "Payout failed. Please try again or contact support." }, { status: 400 });
      }

      await supabaseAdmin
        .from("withdrawals")
        .update({
          stripe_payout_id: payout.id,
          payout_method: payoutMethod,
          status: payout.status, // usually 'pending' then webhook updates to 'paid'
        })
        .eq("id", w.id);

      // Transfer the platform fee from the connected account to the platform account.
      // This must happen after the payout succeeds.
      // Instant only: 5% of payout amount stays in the connected balance after the
      // payout goes out (gross - net = fee), so we transfer it to the platform.
      // Standard payouts: no platform fee.
      if (payoutType === "instant" && platformFee > 0 && process.env.STRIPE_PLATFORM_ACCOUNT_ID) {
        try {
          await stripe.transfers.create(
            {
              amount: toCents(platformFee),
              currency: "usd",
              destination: process.env.STRIPE_PLATFORM_ACCOUNT_ID,
              description: `Platform fee for withdrawal ${w.id}`,
              metadata: { withdrawal_id: w.id, user_id: userId, fee_usd: platformFee.toFixed(2) },
            },
            { stripeAccount }
          );
        } catch (feeErr) {
          const feeErrMsg = feeErr instanceof Error ? feeErr.message : String(feeErr ?? "Fee transfer failed");
          console.error("Platform fee transfer failed:", feeErrMsg);
          sendAdminAlert({
            subject: "Platform fee transfer failed",
            body: `Failed to transfer $${platformFee.toFixed(2)} platform fee for withdrawal ${w.id} (user ${userId}). Payout was already sent. MANUAL FEE RECOVERY REQUIRED.`,
            severity: "critical",
            meta: { withdrawal_id: w.id, user_id: userId, fee_usd: platformFee.toFixed(2), error: feeErrMsg },
          });
        }
      }
    }

    // Track daily withdrawal total (inside lock to prevent race condition)
    try {
      await supabaseAdmin.rpc("increment_daily_withdrawn", { uid: userId, amt });
    } catch (_) {}

    // Release the wallet lock now that withdrawal + ledger + daily counter are finalized
    try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}

    // Auto-finalize closed accounts once balance reaches zero
    if (prof?.account_status === "closed") {
      const newBalance = Number((balance - amt).toFixed(2));
      if (newBalance <= 0) {
        try {
          // Re-read current status to prevent double-finalization from concurrent requests
          const { data: current } = await supabaseAdmin
            .from("profiles")
            .select("account_status")
            .eq("user_id", userId)
            .single();

          if (current?.account_status !== "closed_finalized") {
            await supabaseAdmin
              .from("profiles")
              .update({ account_status: "closed_finalized" })
              .eq("user_id", userId);
            await addLedgerEntry({
              user_id: userId,
              amount: 0,
              type: "system",
              status: "completed",
              meta: { action: "account_fully_closed", timestamp: new Date().toISOString() },
            });
            // Record closure in Stripe account metadata for audit trail
            try {
              await stripe.accounts.update(stripeAccount, {
                metadata: { account_status: "closed_finalized", closed_at: new Date().toISOString() },
              });
            } catch (e) {
              console.error("Stripe account metadata update failed on finalization:", e);
            }
          }
        } catch (e) {
          console.error("Account finalization failed:", e);
        }
      }
    }

    // Log withdrawal signal and refresh baseline (throttled: only if stale or high tx count)
    try {
      await logFraudSignal(userId, "withdrawal_completed", 0, {
        amount: amt,
        risk_score: trust.score,
        risk_level: trust.risk,
        trust_tier: trustTier,
        trust_tier_label: trustTierPolicy.label,
        creator_category: creatorCategory?.name || null,
        creator_category_risk: categoryRisk,
        creator_category_requires_manual_review: categoryNeedsManualReview,
        new_device: newDeviceSignal,
        new_ip: newIpSignal,
        multi_account_signal: multiAccountSignal,
        ip_reputation_provider: ipReputation.provider,
        ip_reputation_available: ipReputation.available,
        ip_reputation_high_risk: ipReputation.highRisk,
        ip_reputation_reason: ipReputation.reason,
        ip_reputation_score: ipReputation.score,
        ip_reputation_vpn: ipReputation.isVpn,
        ip_reputation_proxy: ipReputation.isProxy,
        ip_reputation_tor: ipReputation.isTor,
        ip_reputation_recent_abuse: ipReputation.recentAbuse,
      });

      // Only refresh baseline if it's been >15min since last update
      const lastBaselineUpdate = baseline?.updated_at
        ? new Date(String(baseline.updated_at)).getTime()
        : 0;
      if (Date.now() - lastBaselineUpdate > 15 * 60 * 1000) {
        await supabaseAdmin.rpc("refresh_user_baseline", { p_user_id: userId });
      }
    } catch (_) {}

    // Send withdrawal confirmation email (best-effort, non-blocking)
    if (userRes.user.email) {
      const releaseDateStr = releaseAt
        ? new Date(releaseAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : undefined;
      sendWithdrawalSuccess({
        to: userRes.user.email,
        withdrawalId: w.id,
        amountUsd: `$${amt.toFixed(2)}`,
        feeUsd: `$${withdrawalFee.toFixed(2)}`,
        netUsd: `$${netAmount.toFixed(2)}`,
        status: withdrawalStatus as "approved" | "pending" | "under_review",
        delayDays: effectiveDelayDays,
        releaseDateStr,
      }).catch(() => {});
    }

    emitSecurityEvent({ type: "PAYOUT_CREATED", userId, route: "/api/withdrawals/create", metadata: { amountUsd: amt, status: withdrawalStatus } });

    return NextResponse.json({
      ok: true,
      withdrawal_id: w.id,
      amount: amt,
      fee: withdrawalFee,
      net: netAmount,
      status: withdrawalStatus,
      trust_tier: trustTier,
      trust_tier_label: trustTierPolicy.label,
      creator_category: creatorCategory?.name || null,
      creator_category_risk: categoryRisk,
      payout_delay_days: effectiveDelayDays,
      instant_eligible: effectiveInstantEligible,
      payout_policy_reason: payoutPolicyReason,
      payout_method: withdrawalStatus === "approved" ? "instant" : "standard",
      message: withdrawalStatus === "approved"
        ? `Payout initiated (${trustTierPolicy.label} tier)`
        : withdrawalStatus === "under_review"
          ? "Withdrawal submitted for manual review"
          : `Processing payout under ${trustTierPolicy.label} tier policy`,
      release_at: releaseAt,
    });
  } catch (e: unknown) {
    logCaughtError("api/withdrawals/create", e);
    // Best-effort lock release on unexpected errors
    try {
      if (lockUserId) await releaseWalletLock(supabaseAdmin, lockUserId, "withdrawal");
    } catch (_) {}
    return NextResponse.json({ error: "Withdrawal failed. Please try again." }, { status: 500 });
  }
}
