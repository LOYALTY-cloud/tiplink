import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import { getCreatorCategoryByName } from "@/lib/creatorCategoriesServer";

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

    // Require verified email for Stripe onboarding
    try {
      await requireVerifiedEmail(user.id);
    } catch {
      return NextResponse.json({ error: "Please verify your email before setting up payouts" }, { status: 403 });
    }

    // 2) Load creator profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, stripe_account_id, payouts_enabled, creator_activity_category, first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("stripe/connect/onboard profile", profileErr);
      return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
    }

    if (!profile?.creator_activity_category) {
      return NextResponse.json(
        { error: "Please select your creator activity category before starting Stripe onboarding." },
        { status: 400 }
      );
    }

    // If profile row doesn't exist, create it (safe)
    if (!profile) {
      await supabaseAdmin.from("profiles").upsert({ user_id: user.id, handle: user.id }, { onConflict: "user_id" });
    }

    let stripeAccountId = profile?.stripe_account_id || null;

    // 3) Create Express account if missing
    if (!stripeAccountId) {
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
          app: "1nelink",
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

    // 4) Prefill account data with business info to reduce verification requests
    const emailParts = user.email?.split("@") || ["creator"];
    const firstName = profile?.first_name || emailParts[0]?.split(".")[0] || "Creator";
    const lastName = profile?.last_name || emailParts[0]?.split(".")[1] || user.id.slice(0, 8);
    const creatorCategory = await getCreatorCategoryByName(profile?.creator_activity_category);
    if (!creatorCategory) {
      return NextResponse.json(
        { error: "Please select your creator activity category before starting Stripe onboarding." },
        { status: 400 }
      );
    }

    const productDescription = creatorCategory.stripe_description;

    await stripe.accounts.update(stripeAccountId, {
      business_type: "individual",
      business_profile: {
        product_description: productDescription,
        mcc: "5815", // Digital goods merchant code
        url: "https://1nelink.com",
      },
      individual: {
        email: user.email || undefined,
        first_name: firstName,
        last_name: lastName,
      },
    }).catch((e) => {
      console.log("Failed to prefill account data (non-blocking):", e instanceof Error ? e.message : e);
    });

    // 5) Create onboarding link with eventually_due to collect more info upfront
    const refresh_url = siteUrl("/dashboard?stripe=refresh");
    const return_url = siteUrl("/dashboard?stripe=return");

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url,
      return_url,
      type: "account_onboarding",
      collection_options: {
        fields: "eventually_due",
      },
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
