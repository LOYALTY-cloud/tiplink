import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WalletRow } from "@/types/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Fetch wallet balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance,currency")
      .eq("user_id", user.id)
      .maybeSingle()
      .returns<WalletRow | null>();

    const totalBalance = Number(wallet?.balance ?? 0);

    // Fetch Stripe connected account for enriched balance data
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let instantAvailable = 0;
    let availableSoon = 0;

    if (profile?.stripe_account_id) {
      try {
        const { getStripe } = await import("@/lib/stripe/server");
        const stripe = getStripe();

        const bal = await stripe.balance.retrieve(
          { expand: ["instant_available.net_available"] },
          { stripeAccount: profile.stripe_account_id }
        );

        // Instant available (net of Stripe's instant payout fee)
        for (const entry of bal.instant_available ?? []) {
          if (entry.currency !== "usd") continue;
          const netAvail = (entry as unknown as { net_available?: { amount: number }[] }).net_available;
          if (Array.isArray(netAvail) && netAvail.length > 0) {
            instantAvailable += netAvail.reduce((sum, d) => sum + (d.amount ?? 0), 0);
          } else {
            instantAvailable += entry.amount ?? 0;
          }
        }
        instantAvailable = instantAvailable / 100;

        // Pending (available soon) — funds in transit not yet settled
        const pendingCents = (bal.pending ?? [])
          .filter((p) => p.currency === "usd")
          .reduce((sum, p) => sum + p.amount, 0);
        availableSoon = pendingCents / 100;
      } catch (stripeErr) {
        // Non-fatal — return wallet balance without Stripe enrichment
        console.warn("wallet/balance: Stripe fetch failed", stripeErr instanceof Error ? stripeErr.message : stripeErr);
      }
    }

    return NextResponse.json({
      total_balance: totalBalance,
      available_balance: totalBalance,
      available_soon: availableSoon,
      instant_available: instantAvailable,
      currency: wallet?.currency ?? "usd",
    });
  } catch (err: unknown) {
    console.error("wallet/balance", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
