import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
    // stripeInstantNet: what Stripe will actually pay out for an instant payout.
    // Stripe charges a fee ON TOP of the payout amount, so net_available is the
    // ceiling for the payout amount (what lands in the bank).  We must request
    // a Stripe payout of at most this value, so our fee calc must respect it.
    let stripeInstantNet = 0;
    let pendingAvailableOn: string | null = null;

    if (profile?.stripe_account_id) {
      try {
        const { getStripe } = await import("@/lib/stripe/server");
        const stripe = getStripe();
        const nowUnix = Math.floor(Date.now() / 1000);

        // Expand net_available so we get the exact payout ceiling after
        // Stripe's own instant-payout fee (varies by account; ~1.5–5%).
        const bal = await stripe.balance.retrieve(
          { expand: ["instant_available.net_available"] },
          { stripeAccount: profile.stripe_account_id }
        );

        stripeAvailable = (bal.available ?? [])
          .filter((p) => p.currency === "usd")
          .reduce((sum, p) => sum + p.amount, 0) / 100;

        stripePending = (bal.pending ?? [])
          .filter((p) => p.currency === "usd")
          .reduce((sum, p) => sum + p.amount, 0) / 100;

        // net_available = sum of net_available[].amount across all USD instant entries.
        // This is the max payout amount (bank-receive) Stripe will approve for instant.
        // If the account has no instant-eligible external account, net_available is []
        // and this remains 0.
        for (const entry of (bal as any).instant_available ?? []) {
          if (entry.currency !== "usd") continue;
          const nets: { amount: number }[] = entry.net_available ?? [];
          if (nets.length > 0) {
            stripeInstantNet += nets.reduce((s: number, d: { amount: number }) => s + (d.amount ?? 0), 0) / 100;
          } else {
            // Expand not supported / no linked card — fall back to gross minus estimated fee
            stripeInstantNet += (entry.amount ?? 0) / 100;
          }
        }

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
    const availableBalance = dbBalance > 0 ? dbBalance : stripeAvailable;

    // Available Soon = only Stripe pending (funds in transit, not yet settled)
    const availableSoon = stripePending;

    // Max the user can withdraw for instant:
    //   payout sent to Stripe = withdrawal × (1 - 0.05) [our fee]
    //   payout must be ≤ stripeInstantNet [Stripe's ceiling]
    //   → max withdrawal = stripeInstantNet / 0.95
    // Also capped by the DB balance.
    const instantWithdrawalMax = stripeInstantNet > 0
      ? Math.min(availableBalance, stripeInstantNet / (1 - 0.05))
      : availableBalance;
    // What actually arrives in the bank = instantWithdrawalMax × 0.95
    const instantAvailable = Math.round(instantWithdrawalMax * (1 - 0.05) * 100) / 100;

    return NextResponse.json({
      total_balance: availableBalance,
      available_balance: availableBalance,
      stripe_available: stripeAvailable,
      stripe_instant_net: stripeInstantNet,
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
