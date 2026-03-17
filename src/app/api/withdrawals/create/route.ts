import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { getWithdrawalFee, getNetWithdrawalAmount } from "@/lib/walletFees";
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

    // Load profile (Stripe status + fraud/age/status checks)
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_payouts_enabled, is_flagged, created_at, account_status")
      .eq("user_id", userId)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

    // Account status enforcement
    // closed accounts are still allowed to withdraw their remaining balance
    if (prof?.account_status === "suspended") {
      return NextResponse.json({ error: "Account suspended" }, { status: 403 });
    }
    if (prof?.account_status === "restricted") {
      return NextResponse.json({ error: "Withdrawals temporarily restricted" }, { status: 403 });
    }
    if (prof?.account_status === "closed_finalized") {
      return NextResponse.json({ error: "Account fully closed" }, { status: 403 });
    }

    if (!prof?.stripe_account_id) return NextResponse.json({ error: "Stripe not connected" }, { status: 400 });
    if (!prof.stripe_payouts_enabled) return NextResponse.json({ error: "Payouts not enabled" }, { status: 400 });

    // Block flagged accounts
    if (prof.is_flagged) {
      return NextResponse.json({ error: "Account restricted" }, { status: 403 });
    }

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

    if (amt > balance) {
      return NextResponse.json({ error: "Insufficient balance", balance }, { status: 400 });
    }

    // Velocity check: cap withdrawals at $500 per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentDebits } = await supabaseAdmin
      .from("transactions_ledger")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "withdrawal")
      .gte("created_at", oneHourAgo);

    const recentTotal = (recentDebits ?? []).reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0);
    if (recentTotal + amt > 500) {
      return NextResponse.json({ error: "Hourly withdrawal limit exceeded. Try again later." }, { status: 429 });
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
        status: "pending",
      })
      .select("id")
      .single();

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
          statement_descriptor: "TIPLINKME PAYOUT",
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
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
