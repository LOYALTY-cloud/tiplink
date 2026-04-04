import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { getWithdrawalFee, getNetWithdrawalAmount } from "@/lib/walletFees";
import { validateWithdrawal } from "@/lib/withdrawalRules";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import { checkSoftRestrictions } from "@/lib/softRestrictions";
import { calculateTrustScore, type TrustInput } from "@/lib/trustScore";
import { shouldAutoFreeze, executeAutoFreeze, type FreezeContext } from "@/lib/autoFreeze";
import { hasSuspiciousLogins } from "@/lib/loginTracker";
import { logCaughtError } from "@/lib/errorLogger";
import type { ProfileRow } from "@/types/db";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => Number((n / 100).toFixed(2));

export async function POST(req: Request) {
  try {
    const { amount } = await req.json();
    const amt = Number(amount);

    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

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

    // Require verified email for withdrawals
    try {
      await requireVerifiedEmail(userId);
    } catch {
      return NextResponse.json({ error: "Please verify your email before withdrawing" }, { status: 403 });
    }

    // Check fraud-based soft restrictions
    const restriction = await checkSoftRestrictions(userId);
    if (restriction.blocked) {
      return NextResponse.json({ error: restriction.reason }, { status: 403 });
    }

    // Block withdrawal if user has suspicious login patterns (3+ IPs in 1 hour)
    const suspicious = await hasSuspiciousLogins(userId);
    if (suspicious) {
      return NextResponse.json(
        { error: "Unusual login activity detected. Withdrawal blocked for security. Contact support." },
        { status: 403 }
      );
    }

    // Load profile (Stripe status + account state)
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_payouts_enabled, is_flagged, created_at, account_status, payout_hold_until, daily_withdrawn, restricted_until")
      .eq("user_id", userId)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

    // Run state-driven withdrawal safety rules
    if (prof) {
      const check = validateWithdrawal(prof, amt) as { ok: boolean; reason?: string; expired_restriction?: boolean };
      if (!check.ok) {
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

    if (!prof?.stripe_account_id) return NextResponse.json({ error: "Stripe not connected" }, { status: 400 });
    if (!prof.stripe_payouts_enabled) return NextResponse.json({ error: "Payouts not enabled" }, { status: 400 });

    // Block withdrawals for accounts younger than 24 hours
    const accountAgeMs = Date.now() - new Date(prof.created_at ?? 0).getTime();
    if (accountAgeMs < 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Withdrawals are available 24 hours after account creation" }, { status: 403 });
    }

    const stripeAccount = prof.stripe_account_id;

    // Enforce platform-side balance check
    const { data: walletRow, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletErr) return NextResponse.json({ error: walletErr.message }, { status: 500 });

    const balance = Number((walletRow?.balance ?? 0) || 0);
    // Closed accounts can only withdraw — but must have a balance to do so
    if (prof?.account_status === "closed" && balance <= 0) {
      return NextResponse.json({ error: "No balance remaining" }, { status: 400 });
    }

    // Block withdrawal if pending refunds (initiated within last 10 min) would push balance negative
    const initiatedCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: pendingRefunds } = await supabaseAdmin
      .from("tip_intents")
      .select("tip_amount, refunded_amount")
      .eq("creator_user_id", userId)
      .eq("refund_status", "initiated")
      .gte("refund_initiated_at", initiatedCutoff);

    const pendingRefundTotal = (pendingRefunds ?? []).reduce((sum, t) => {
      const owed = Number(t.tip_amount ?? 0) - Number(t.refunded_amount ?? 0);
      return sum + Math.max(0, owed);
    }, 0);

    if (balance - amt < pendingRefundTotal) {
      return NextResponse.json(
        { error: `Withdrawal blocked: $${pendingRefundTotal.toFixed(2)} in pending refunds must be covered by remaining balance` },
        { status: 409 }
      );
    }

    if (amt > balance) {
      return NextResponse.json({ error: "Insufficient balance", balance }, { status: 400 });
    }

    // Also check connected Stripe account balance as a secondary guard
    const bal = await stripe.balance.retrieve({ stripeAccount });
    const availableUsdCents =
      (bal.available || [])
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + (b.amount || 0), 0);

    const reqCents = toCents(amt);

    if (reqCents > availableUsdCents) {
      return NextResponse.json(
        { error: "Insufficient connected Stripe balance", available: fromCents(availableUsdCents) },
        { status: 400 }
      );
    }

    // ── Trust score calculation ──────────────────────────────────
    const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));

    // Gather trust signals from DB (parallel queries)
    const [payoutsRes, chargebackRes, avgRes] = await Promise.all([
      supabaseAdmin
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "paid"),
      supabaseAdmin
        .from("fraud_anomalies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("type", ["chargeback", "dispute"]),
      supabaseAdmin
        .from("withdrawals")
        .select("amount")
        .eq("user_id", userId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const successfulPayouts = payoutsRes.count ?? 0;
    const hasChargebacks = (chargebackRes.count ?? 0) > 0;
    const recentChargeback30d = hasChargebacks; // conservative: any chargeback counts

    const pastAmounts = (avgRes.data ?? []).map((r) => Number(r.amount || 0));
    const avgPayout = pastAmounts.length > 0
      ? pastAmounts.reduce((s, a) => s + a, 0) / pastAmounts.length
      : 0;
    const largeWithdrawal = avgPayout > 0 && amt > avgPayout * 2;

    const trustInput: TrustInput = {
      account_age_days: accountAgeDays,
      successful_payouts: successfulPayouts,
      has_chargebacks: hasChargebacks,
      consistent_activity: accountAgeDays >= 7, // simplified: active 7+ days
      same_device: true,  // TODO: wire device fingerprint when available
      stripe_verified: !!prof.stripe_payouts_enabled,
      new_device: false,  // TODO: wire device fingerprint comparison
      new_ip: false,      // TODO: wire IP comparison
      large_withdrawal: largeWithdrawal,
      activity_spike: false, // covered by behavior tracker in fraud orchestrator
      recent_chargeback: recentChargeback30d,
      multi_account_flag: false, // TODO: wire multi-account detection
      is_flagged: !!prof.is_flagged,
    };

    const trust = calculateTrustScore(trustInput);

    // ── Auto-freeze check ─────────────────────────────────────
    // Count rapid withdrawals (3+ in last hour = suspicious)
    const { count: recentWithdrawals } = await supabaseAdmin
      .from("withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    const freezeCtx: FreezeContext = {
      userId,
      trust_score: trust.score,
      recent_chargeback: recentChargeback30d,
      multi_account_flag: false, // TODO: wire multi-account detection
      rapid_withdrawals: (recentWithdrawals ?? 0) >= 3,
      activity_spike: false,
    };

    const freezeReason = shouldAutoFreeze(freezeCtx);
    if (freezeReason) {
      await executeAutoFreeze(userId, freezeReason);
      return NextResponse.json(
        { error: "Account frozen due to suspicious activity", reason: freezeReason },
        { status: 403 }
      );
    }

    // HIGH risk → block + admin review
    if (trust.risk === "high") {
      // Still create the withdrawal row so admin can see it
      await supabaseAdmin.from("withdrawals").insert({
        user_id: userId,
        amount: amt,
        fee: getWithdrawalFee(amt, "instant"),
        net: getNetWithdrawalAmount(amt, "instant"),
        status: "under_review",
        risk_score: trust.score,
        risk_level: trust.risk,
      });

      // Update profile trust score
      await supabaseAdmin
        .from("profiles")
        .update({ trust_score: trust.score, risk_level: trust.risk, last_risk_check: new Date().toISOString() })
        .eq("user_id", userId);

      return NextResponse.json(
        { error: "Withdrawal under review", risk_level: trust.risk, reasons: trust.reasons },
        { status: 403 }
      );
    }

    // Determine release delay for MEDIUM risk
    let releaseAt: string | null = null;
    if (trust.risk === "medium") {
      const delayMinutes = 30 + Math.floor(Math.random() * 31); // 30–60 min
      releaseAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
    }

    // Acquire a per-user wallet lock to prevent concurrent withdrawals/refund races
    const lock = await acquireWalletLock(supabaseAdmin, userId, "withdrawal", 300);
    if (!lock.ok) {
      return NextResponse.json({ error: "Withdrawal already in progress" }, { status: 409 });
    }

    // Compute fee + net
    const withdrawalFee = getWithdrawalFee(amt, "instant");
    const netAmount = getNetWithdrawalAmount(amt, "instant");

    // Create withdrawal row first
    const { data: w, error: wErr } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount: amt,
        fee: withdrawalFee,
        net: netAmount,
        status: trust.risk === "low" ? "approved" : "pending",
        risk_score: trust.score,
        risk_level: trust.risk,
        release_at: releaseAt,
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
      return NextResponse.json({ error: wErr.message }, { status: 500 });
    }

    // Log withdrawal to ledger (debit)
    try {
      await addLedgerEntry({
        user_id: userId,
        type: "withdrawal",
        amount: Number((-amt).toFixed(2)),
        reference_id: w.id,
        meta: { action: "withdrawal", method: "instant", fee: withdrawalFee, net: netAmount, currency: "usd" },
        status: "processing",
      });
    } catch (err: unknown) {
      // Attempt to rollback withdrawal row if ledger logging fails
      try { await supabaseAdmin.from("withdrawals").delete().eq("id", w.id); } catch (e) {}
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: "Failed to log ledger entry" }, { status: 500 });
    }

    // Only attempt instant payouts
    const payoutMethod = "instant" as const;
    let payout;

    try {
      payout = await stripe.payouts.create(
        {
          amount: reqCents,
          currency: "usd",
          method: "instant",
          statement_descriptor: "1NELINK PAYOUT",
          metadata: { withdrawal_id: w.id, user_id: userId },
        },
        { stripeAccount }
      );
    } catch (err: unknown) {
      // If instant payout fails, surface the error to the client
      const payoutErr = err instanceof Error ? err.message : String(err ?? "Instant payout failed");
      try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}
      return NextResponse.json({ error: payoutErr }, { status: 400 });
    }

    await supabaseAdmin
      .from("withdrawals")
      .update({
        stripe_payout_id: payout.id,
        payout_method: payoutMethod,
        status: payout.status, // usually 'pending' then webhook updates to 'paid'
      })
      .eq("id", w.id);
    // Release the wallet lock now that withdrawal + ledger + payout initiated
    try { await releaseWalletLock(supabaseAdmin, userId, "withdrawal"); } catch (_) {}

    // Track daily withdrawal total
    try {
      await supabaseAdmin.rpc("increment_daily_withdrawn", { uid: userId, amt });
    } catch (_) {}

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

    return NextResponse.json({
      ok: true,
      withdrawal_id: w.id,
      payout_id: payout.id,
      payout_status: payout.status,
      payout_method: payoutMethod,
      amount: amt,
      fee: withdrawalFee,
      net: netAmount,
      risk_score: trust.score,
      risk_level: trust.risk,
      release_at: releaseAt,
    });
  } catch (e: unknown) {
    logCaughtError("api/withdrawals/create", e);
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
