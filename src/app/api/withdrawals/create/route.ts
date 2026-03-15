import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import type { ProfileRow } from "@/types/db";

export const runtime = "nodejs";


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

    // Load Stripe connect status
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_payouts_enabled")
      .eq("user_id", userId)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
    if (!prof?.stripe_account_id) return NextResponse.json({ error: "Stripe not connected" }, { status: 400 });
    if (!prof.stripe_payouts_enabled) return NextResponse.json({ error: "Payouts not enabled" }, { status: 400 });

    const stripeAccount = prof.stripe_account_id;

    // Enforce platform-side available balance (respect 7-day pending delay)
    const { data: walletRow, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("available")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletErr) return NextResponse.json({ error: walletErr.message }, { status: 500 });

    const available = Number((walletRow?.available ?? 0) || 0);
    if (amt > available) {
      return NextResponse.json({ error: "Insufficient available balance", available }, { status: 400 });
    }

    // Also check connected Stripe account balance as a secondary guard
    const stripe = getStripe();
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

    // Create withdrawal row first
    const { data: w, error: wErr } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount: amt,
        fee: 0,
        net: amt,
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
        metadata: { method: "stripe", fee: 0 },
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

    return NextResponse.json({
      ok: true,
      withdrawal_id: w.id,
      payout_id: payout.id,
      payout_status: payout.status,
      payout_method: payoutMethod,
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
