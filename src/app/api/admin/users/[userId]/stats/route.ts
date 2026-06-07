import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await params;

    const [walletRes, tipsRes, disputeRes, profileRes] = await Promise.all([
      supabaseAdmin
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id, tip_amount, refunded_amount, refund_status, status, created_at")
        .eq("creator_user_id", userId)
        .neq("refund_status", "none")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id", { count: "exact", head: true })
        .eq("creator_user_id", userId)
        .eq("status", "disputed"),
      supabaseAdmin
        .from("profiles")
        .select("stripe_account_id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // ── Stripe balance breakdown (support admin can see what creator sees) ──
    let stripeAvailable = 0;
    let stripeInstantNet = 0;
    let stripePending = 0;
    let pendingAvailableOn: string | null = null;

    const stripeAccountId = profileRes.data?.stripe_account_id ?? null;
    if (stripeAccountId) {
      try {
        const nowUnix = Math.floor(Date.now() / 1000);
        const bal = await stripe.balance.retrieve(
          { expand: ["instant_available.net_available"] },
          { stripeAccount: stripeAccountId }
        );

        stripeAvailable = (bal.available ?? [])
          .filter((p) => p.currency === "usd")
          .reduce((sum, p) => sum + p.amount, 0) / 100;

        stripePending = (bal.pending ?? [])
          .filter((p) => p.currency === "usd")
          .reduce((sum, p) => sum + p.amount, 0) / 100;

        for (const entry of (bal as any).instant_available ?? []) {
          if (entry.currency !== "usd") continue;
          const nets: { amount: number }[] = entry.net_available ?? [];
          stripeInstantNet += nets.length > 0
            ? nets.reduce((s: number, d: { amount: number }) => s + (d.amount ?? 0), 0) / 100
            : (entry.amount ?? 0) / 100;
        }

        if (stripePending > 0) {
          try {
            const txns = await stripe.balanceTransactions.list(
              { available_on: { gt: nowUnix }, limit: 100 } as any,
              { stripeAccount: stripeAccountId }
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
          } catch { /* non-fatal */ }
        }
      } catch { /* non-fatal — Stripe may be unavailable */ }
    }

    // Mirror the exact same fallback logic as /api/wallet/balance so admin
    // sees what the creator actually sees on their wallet page.
    const dbBalance = Number(walletRes.data?.balance ?? 0);
    const stripeTotal = stripeAvailable + stripePending;
    const displayBalance = stripeTotal > 0 ? stripeTotal : dbBalance;
    const instantAvailable = stripeInstantNet > 0 ? stripeInstantNet : stripeAvailable;

    return NextResponse.json({
      wallet: walletRes.data ?? { balance: 0 },
      tips: tipsRes.data ?? [],
      disputeCount: disputeRes.count ?? 0,
      stripeBalance: {
        available: stripeAvailable,
        instant_net: stripeInstantNet,
        instant_available: instantAvailable,
        pending: stripePending,
        pending_available_on: pendingAvailableOn,
        stripe_account_id: stripeAccountId,
        display_balance: displayBalance,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
