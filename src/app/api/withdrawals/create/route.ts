import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";
import { addLedgerEntry } from "@/lib/ledger";
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

    // Check connected account balance
    const bal = await stripe.balance.retrieve({ stripeAccount });
    const availableUsdCents =
      (bal.available || [])
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + (b.amount || 0), 0);

    const reqCents = toCents(amt);

    if (reqCents > availableUsdCents) {
      return NextResponse.json(
        { error: "Insufficient available balance", available: fromCents(availableUsdCents) },
        { status: 400 }
      );
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

    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

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
