import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", user_id)
      .maybeSingle()
      .returns<import("@/types/db").ProfileRow | null>();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ payouts_enabled: false, reason: "no_account" });
    }

    const acct = await stripe.accounts.retrieve(profile.stripe_account_id);

    // "Ready enough" heuristic:
    const payoutsEnabled =
      Boolean((acct as any).payouts_enabled) &&
      Boolean((acct as any).charges_enabled);

    await supabaseAdmin
      .from("profiles")
      .update({
        payouts_enabled: payoutsEnabled,
        payouts_enabled_at: payoutsEnabled ? new Date().toISOString() : null,
      })
      .eq("user_id", user_id);

    return NextResponse.json({
      payouts_enabled: payoutsEnabled,
      charges_enabled: (acct as any).charges_enabled,
      payouts_enabled_stripe: (acct as any).payouts_enabled,
      details_submitted: (acct as any).details_submitted,
    });
  } catch (e: unknown) {
    console.log("stripe connect sync error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
