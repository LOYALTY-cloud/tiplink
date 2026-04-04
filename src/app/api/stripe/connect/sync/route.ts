import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/server";
import { syncExternalAccounts } from "@/lib/syncExternalAccounts";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    // Authenticate caller
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { createClient: createAnonClient } = await import("@supabase/supabase-js");
    const supabaseUser = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user_id = authRes.user.id;

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

    const chargesEnabled = Boolean(acct.charges_enabled);
    const payoutsEnabledStripe = Boolean(acct.payouts_enabled);
    const onboardingComplete = chargesEnabled && payoutsEnabledStripe;

    await supabaseAdmin
      .from("profiles")
      .update({
        stripe_charges_enabled: chargesEnabled,
        stripe_payouts_enabled: payoutsEnabledStripe,
        stripe_onboarding_complete: onboardingComplete,
        payouts_enabled: onboardingComplete,
        payouts_enabled_at: onboardingComplete ? new Date().toISOString() : null,
      })
      .eq("user_id", user_id);

    // Sync external accounts (cards/bank accounts) from Stripe Connect → local DB
    if (onboardingComplete) {
      try {
        await syncExternalAccounts(user_id, profile.stripe_account_id);
      } catch (e) {
        console.log("External account sync error:", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({
      payouts_enabled: onboardingComplete,
      charges_enabled: chargesEnabled,
      payouts_enabled_stripe: payoutsEnabledStripe,
      details_submitted: acct.details_submitted,
    });
  } catch (e: unknown) {
    console.log("stripe connect sync error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
