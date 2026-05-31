import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWithdrawalFee, getNetWithdrawalAmount } from "@/lib/walletFees";

export const runtime = "nodejs";

const fromCents = (n: number) => Number((n / 100).toFixed(2));

/**
 * GET /api/wallet/withdrawal-availability
 *
 * Returns a breakdown of how much the user can withdraw and how much
 * is eligible for instant payout vs still settling in Stripe.
 *
 * Response shape:
 * {
 *   wallet_balance:          number,   // internal wallet balance
 *   stripe_available:        number,   // Stripe available balance (USD)
 *   stripe_pending:          number,   // Stripe pending balance (USD)
 *   instant_available:       number,   // Stripe instant-eligible balance (USD)
 *   withdrawal_fee_percent:  number,   // e.g. 5
 *   instant_fee:             number,   // fee on instant_available amount
 *   instant_net:             number,   // what the user receives on instant withdrawal
 *   stripe_connected:        boolean,
 *   payouts_enabled:         boolean,
 * }
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userRes.user.id;

    // Load wallet balance + Stripe account info in parallel
    const [walletRes, profileRes] = await Promise.all([
      supabaseAdmin.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("stripe_account_id, stripe_payouts_enabled")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const walletBalance = Number(walletRes.data?.balance ?? 0);
    const stripeAccountId = profileRes.data?.stripe_account_id ?? null;
    const payoutsEnabled = Boolean(profileRes.data?.stripe_payouts_enabled);

    // Default response when Stripe isn't connected yet
    if (!stripeAccountId) {
      return NextResponse.json({
        wallet_balance: walletBalance,
        stripe_available: 0,
        stripe_pending: 0,
        instant_available: 0,
        withdrawal_fee_percent: 5,
        instant_fee: 0,
        instant_net: 0,
        stripe_connected: false,
        payouts_enabled: false,
      });
    }

    // Fetch Stripe balance for the connected account
    let stripeAvailable = 0;
    let stripePending = 0;
    let instantAvailable = 0;

    try {
      const bal = await stripe.balance.retrieve({ stripeAccount: stripeAccountId });

      stripeAvailable = fromCents(
        (bal.available || [])
          .filter((b) => b.currency === "usd")
          .reduce((sum, b) => sum + (b.amount || 0), 0)
      );

      stripePending = fromCents(
        (bal.pending || [])
          .filter((b) => b.currency === "usd")
          .reduce((sum, b) => sum + (b.amount || 0), 0)
      );

      instantAvailable = fromCents(
        ((bal as any).instant_available || [])
          .filter((b: any) => b.currency === "usd")
          .reduce((sum: number, b: any) => sum + (b.amount || 0), 0)
      );
    } catch (stripeErr) {
      console.error("withdrawal-availability: Stripe balance fetch failed:", stripeErr);
      // Return wallet data without Stripe breakdown rather than hard-failing
      return NextResponse.json({
        wallet_balance: walletBalance,
        stripe_available: 0,
        stripe_pending: 0,
        instant_available: 0,
        withdrawal_fee_percent: 5,
        instant_fee: 0,
        instant_net: 0,
        stripe_connected: true,
        payouts_enabled: payoutsEnabled,
        stripe_error: "Unable to fetch Stripe balance at this time",
      });
    }

    // Use the lower of wallet balance and instant_available as the effective instant amount
    const effectiveInstant = Math.min(walletBalance, instantAvailable);
    const instantFee = getWithdrawalFee(effectiveInstant, "instant");
    const instantNet = getNetWithdrawalAmount(effectiveInstant, "instant");

    return NextResponse.json({
      wallet_balance: walletBalance,
      stripe_available: stripeAvailable,
      stripe_pending: stripePending,
      instant_available: effectiveInstant,
      withdrawal_fee_percent: 5,
      instant_fee: instantFee,
      instant_net: instantNet,
      stripe_connected: true,
      payouts_enabled: payoutsEnabled,
    });
  } catch (e: unknown) {
    console.error("withdrawal-availability error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
