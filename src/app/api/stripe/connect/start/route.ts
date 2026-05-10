import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import type { ProfileRow } from "@/types/db";
import { getCreatorCategoryByName } from "@/lib/creatorCategoriesServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userRes.user.id;

    // Require verified email for Stripe setup
    try {
      await requireVerifiedEmail(userId);
    } catch {
      return NextResponse.json({ error: "Please verify your email before setting up payouts" }, { status: 403 });
    }

    // Check existing stripe account
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, creator_activity_category, first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) return NextResponse.json({ error: "Failed to start Stripe setup" }, { status: 500 });

    if (!prof?.creator_activity_category) {
      return NextResponse.json(
        { error: "Please select your creator activity category before starting Stripe onboarding." },
        { status: 400 }
      );
    }

    let accountId = prof?.stripe_account_id as string | null;

    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        country: "US",
        business_type: "individual",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { user_id: userId },
      });

      accountId = acct.id;

      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("user_id", userId);

      if (upErr) return NextResponse.json({ error: "Failed to start Stripe setup" }, { status: 500 });
    }

    // Prefill account data with business info to reduce verification requests
    const emailParts = (userRes.user.email || "").split("@");
    const firstName = prof?.first_name || emailParts[0]?.split(".")[0] || "Creator";
    const lastName = prof?.last_name || emailParts[0]?.split(".")[1] || userId.slice(0, 8);
    const creatorCategory = await getCreatorCategoryByName(prof?.creator_activity_category);
    if (!creatorCategory) {
      return NextResponse.json(
        { error: "Please select your creator activity category before starting Stripe onboarding." },
        { status: 400 }
      );
    }

    const productDescription = creatorCategory.stripe_description;

    await stripe.accounts.update(accountId, {
      business_type: "individual",
      business_profile: {
        product_description: productDescription,
        mcc: "5815", // Digital goods merchant code
        url: "https://1nelink.com",
      },
      individual: {
        email: userRes.user.email || undefined,
        first_name: firstName,
        last_name: lastName,
      },
    }).catch((e) => {
      console.log("Failed to prefill account data (non-blocking):", e instanceof Error ? e.message : e);
    });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: `${baseUrl}/dashboard/stripe/return`,
      refresh_url: `${baseUrl}/dashboard/stripe/refresh`,
      collection_options: {
        fields: "eventually_due",
      },
    });

    return NextResponse.json({ url: accountLink.url, accountId });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Failed to start Stripe setup" }, { status: 500 });
  }
}
