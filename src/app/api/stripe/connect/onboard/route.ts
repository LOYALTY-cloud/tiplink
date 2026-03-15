import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";


function siteUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Creates (or reuses) a Stripe Express Connect account for the logged-in creator,
 * stores stripe_account_id on profiles, and returns an Account Link onboarding URL.
 *
 * Caller must be logged in (uses Supabase access token).
 */
export async function POST(req: Request) {
  try {
    // 1) Auth: read Supabase session token from Authorization header
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const supabaseUserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userRes, error: userErr } = await supabaseUserClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = userRes.user;

    // 2) Load creator profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, stripe_account_id, payouts_enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // If profile row doesn't exist, create it (safe)
    if (!profile) {
      await supabaseAdmin.from("profiles").upsert({ user_id: user.id, handle: user.id }, { onConflict: "user_id" });
    }

    let stripeAccountId = profile?.stripe_account_id || null;

    // 3) Create Express account if missing
    if (!stripeAccountId) {
      const stripe = getStripe();
      const acct = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          user_id: user.id,
          supabase_user_id: user.id,
          app: "tiplinkme",
        },
      });

      stripeAccountId = acct.id;

      await supabaseAdmin
        .from("profiles")
        .update({
          stripe_account_id: stripeAccountId,
          payouts_enabled: false,
          payouts_enabled_at: null,
        })
        .eq("user_id", user.id);
    }

    // 4) Create onboarding link
    const refresh_url = siteUrl("/dashboard?stripe=refresh");
    const return_url = siteUrl("/dashboard?stripe=return");

    const stripe2 = getStripe();
    const accountLink = await stripe2.accountLinks.create({
      account: stripeAccountId,
      refresh_url,
      return_url,
      type: "account_onboarding",
    });

    return NextResponse.json({
      url: accountLink.url,
      stripe_account_id: stripeAccountId,
    });
  } catch (e: unknown) {
    console.log("stripe connect onboard error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
