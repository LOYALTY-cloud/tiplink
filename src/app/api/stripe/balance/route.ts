import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );

  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id")
    .eq("user_id", userRes.user.id)
    .maybeSingle();

  if (!profile?.stripe_account_id) {
    return NextResponse.json({ instantAvailable: 0 });
  }

  try {
    const stripe = getStripe();
    const nowUnix = Math.floor(Date.now() / 1000);

    // Step 1: get the balance (required — if this fails, return error)
    const balance = await stripe.balance.retrieve(
      { expand: ["instant_available.net_available"] },
      { stripeAccount: profile.stripe_account_id }
    );

    // Sum net_available for instant payout (accounts for the instant fee)
    let netCents = 0;
    for (const entry of balance.instant_available ?? []) {
      if (entry.currency !== "usd") continue;
      const netAvail = (entry as unknown as { net_available?: { amount: number }[] }).net_available;
      if (Array.isArray(netAvail) && netAvail.length > 0) {
        netCents += netAvail.reduce((sum, d) => sum + (d.amount ?? 0), 0);
      } else {
        netCents += entry.amount ?? 0;
      }
    }

    // Sum pending USD balance from the balance object directly
    const pendingCents = (balance.pending ?? [])
      .filter((p) => p.currency === "usd")
      .reduce((sum, p) => sum + p.amount, 0);

    // Step 2: get the soonest available_on date — optional, non-fatal
    let soonestAvailableOn: number | null = null;
    if (pendingCents > 0) {
      try {
        const pendingTxns = await stripe.balanceTransactions.list(
          { available_on: { gt: nowUnix }, limit: 100 },
          { stripeAccount: profile.stripe_account_id }
        );
        for (const txn of pendingTxns.data) {
          if (txn.currency !== "usd") continue;
          if (txn.net < 0) continue; // skip refunds/fees
          const ao = txn.available_on as number | undefined;
          if (typeof ao === "number" && ao > nowUnix) {
            if (soonestAvailableOn === null || ao < soonestAvailableOn) {
              soonestAvailableOn = ao;
            }
          }
        }
      } catch (txnErr) {
        // Non-fatal — we still return pendingAmount, just without the date
        console.warn("stripe/balance: balanceTransactions.list failed", txnErr instanceof Error ? txnErr.message : txnErr);
      }
    }

    return NextResponse.json({
      instantAvailable: netCents / 100,
      pendingAmount: pendingCents / 100,
      pendingAvailableOn: soonestAvailableOn
        ? new Date(soonestAvailableOn * 1000).toISOString()
        : null,
    });
  } catch (err) {
    console.error("stripe/balance error", err);
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
