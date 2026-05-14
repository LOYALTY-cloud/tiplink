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
    const balance = await stripe.balance.retrieve(
      { expand: ["instant_available.net_available"] } as Parameters<typeof stripe.balance.retrieve>[0],
      { stripeAccount: profile.stripe_account_id }
    );

    // Sum net_available amounts for USD across all instant_available entries.
    // net_available accounts for the instant payout fee (typically 1.5% or 1% + $0.25).
    // Each entry in net_available is per-destination; we sum them all.
    let netCents = 0;
    for (const entry of balance.instant_available ?? []) {
      if (entry.currency !== "usd") continue;
      const netAvail = (entry as unknown as { net_available?: { amount: number }[] }).net_available;
      if (Array.isArray(netAvail) && netAvail.length > 0) {
        netCents += netAvail.reduce((sum, d) => sum + (d.amount ?? 0), 0);
      } else {
        // Stripe returned instant_available but no net_available breakdown —
        // fall back to the gross amount so the UI still shows something.
        netCents += entry.amount ?? 0;
      }
    }

    return NextResponse.json({ instantAvailable: netCents / 100 });
  } catch (err) {
    console.error("stripe/balance error", err);
    // Non-fatal — caller handles null gracefully
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
