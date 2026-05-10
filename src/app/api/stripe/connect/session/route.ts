import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import { getCreatorCategoryByName } from "@/lib/creatorCategoriesServer";

export const runtime = "nodejs";

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

    // Require verified email before Stripe onboarding/management
    try {
      await requireVerifiedEmail(user_id);
    } catch {
      return NextResponse.json({ error: "Please verify your email before setting up payouts" }, { status: 403 });
    }

    const body = await req.json();
    const mode = body?.mode; // "manage" for existing accounts

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, creator_activity_category, first_name, last_name")
      .eq("user_id", user_id)
      .maybeSingle();

    if (error) {
      console.error("stripe/connect/session profile", error);
      return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
    }

    let stripeAccountId = profile?.stripe_account_id;

    // Ensure a profiles row exists for this user
    if (!profile) {
      const { error: insErr } = await supabaseAdmin.from("profiles").upsert({ user_id, handle: user_id }, { onConflict: "user_id" });
      if (insErr) {
        console.error("stripe/connect/session upsert", insErr);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }
    }

    // Fetch email from Supabase Auth (admin) — profiles table doesn't store email
    const { data: authUserRes, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (authUserErr) {
      console.error("stripe/connect/session auth user", authUserErr);
      return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
    }

    const email = authUserRes?.user?.email ?? undefined;

    const isManageMode = mode === "manage";
    if (!isManageMode && !profile?.creator_activity_category) {
      return NextResponse.json(
        { error: "Please select your creator activity category before starting Stripe onboarding." },
        { status: 400 }
      );
    }

    if (!stripeAccountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: email,
        business_type: "individual",
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });

      stripeAccountId = acct.id;

      const { error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_account_id: stripeAccountId })
        .eq("user_id", user_id);

      if (updateErr) {
        console.error("stripe/connect/session save stripe_account_id", updateErr);
        return NextResponse.json({ error: "Failed to save Stripe account" }, { status: 500 });
      }
    }

    // Keep account profile data aligned with selected creator activity for cleaner underwriting.
    if (profile?.creator_activity_category) {
      const creatorCategory = await getCreatorCategoryByName(profile.creator_activity_category);
      if (!creatorCategory) {
        return NextResponse.json(
          { error: "Please select your creator activity category before starting Stripe onboarding." },
          { status: 400 }
        );
      }

      const emailParts = (email || "").split("@");
      const firstName = profile?.first_name || emailParts[0]?.split(".")[0] || "Creator";
      const lastName = profile?.last_name || emailParts[0]?.split(".")[1] || user_id.slice(0, 8);

      await stripe.accounts.update(stripeAccountId, {
        business_type: "individual",
        business_profile: {
          product_description: creatorCategory.stripe_description,
          mcc: "5815",
          url: "https://1nelink.com",
        },
        individual: {
          email,
          first_name: firstName,
          last_name: lastName,
        },
      }).catch((e) => {
        console.log("Failed to prefill connect session account data (non-blocking):", e instanceof Error ? e.message : e);
      });
    }

    const components = isManageMode
      ? { account_management: { enabled: true as const } }
      : { account_onboarding: { enabled: true as const } };

    const accountSession = await stripe.accountSessions.create({
      account: stripeAccountId,
      components,
    });

    return NextResponse.json({ client_secret: accountSession.client_secret });
  } catch (e: unknown) {
    console.error("stripe/connect/session error:", e);
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}
