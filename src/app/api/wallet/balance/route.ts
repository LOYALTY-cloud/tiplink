import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getNetWithdrawalAmount } from "@/lib/walletFees";
import type { WalletRow } from "@/types/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Fetch DB wallet balance (canonical ledger)
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance,currency")
      .eq("user_id", user.id)
      .maybeSingle()
      .returns<WalletRow | null>();

    const dbBalance = Number(wallet?.balance ?? 0);

    // Fetch Stripe connected account for the real Stripe balances
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let stripeAvailable = 0;
    let stripePending = 0;
    let pendingAvailableOn: string | null = null;

    if (profile?.stripe_account_id) {
      try {
        const { getStripe } = await import("@/lib/stripe/server");
        const stripe = getStripe();
        const nowUnix = Math.floor(Date.now() / 1000);

        const bal = await stripe.balance.retrieve(
          {},
          { stripeAccount: profile.stripe_account_id }
        );

        stripeAvailable = (bal.available ?? [])
          .filter((p) => p.currency === "usd")
          .reduce((sum, p) => sum + p.amount, 0) / 100;

        stripePending = (bal.pending ?? [])
          .filter((p) => p.currency === "usd")
          .reduce((sum, p) => sum + p.amount, 0) / 100;

        // Fetch soonest available_on date for pending funds
        if (stripePending > 0) {
          try {
            const txns = await stripe.balanceTransactions.list(
              { available_on: { gt: nowUnix }, limit: 100 },
              { stripeAccount: profile.stripe_account_id }
            );
            let soonest: number | null = null;
            for (const txn of txns.data) {
              if (txn.currency !== "usd" || txn.net < 0) continue;
              const ao = txn.available_on as number | undefined;
              if (typeof ao === "number" && ao > nowUnix) {
                if (soonest === null || ao < soonest) soonest = ao;
              }
            }
            if (soonest) pendingAvailableOn = new Date(soonest * 1000).toISOString();
          } catch { /* non-fatal — date just won't show */ }
        }

      } catch (stripeErr) {
        console.warn("wallet/balance: Stripe fetch failed", stripeErr instanceof Error ? stripeErr.message : stripeErr);
      }
    }

    // Available balance = DB wallet (primary) OR Stripe available if no wallet row yet
    const stripeTotal = stripeAvailable + stripePending;
    const availableBalance = dbBalance > 0 ? dbBalance : stripeAvailable;

    // Available Soon = only Stripe pending (funds in transit, not yet settled)
    const availableSoon = stripePending;

    // Instant Withdrawal = available balance after our 5% instant fee
    const instantAvailable = getNetWithdrawalAmount(availableBalance, "instant");

    return NextResponse.json({
      total_balance: availableBalance,
      available_balance: availableBalance,
      available_soon: availableSoon,
      instant_available: instantAvailable,
      pending_available_on: pendingAvailableOn,
      currency: wallet?.currency ?? "usd",
    });
  } catch (err: unknown) {
    console.error("wallet/balance", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
