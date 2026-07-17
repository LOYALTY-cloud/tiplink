import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import { getCreatorCategoryByName } from "@/lib/creatorCategoriesServer";
import { isProhibitedCategory } from "@/lib/stripe/prohibitedCategories";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Authenticate caller
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Unauthorized", _checkpoint: "no_jwt" }, { status: 401 });

    const { createClient: createAnonClient } = await import("@supabase/supabase-js");
    const supabaseUser = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized", _checkpoint: "auth_failed", _detail: authErr?.message }, { status: 401 });

    const user_id = authRes.user.id;

    // Require verified email before Stripe onboarding/management
    try {
      await requireVerifiedEmail(user_id);
    } catch (emailErr) {
      return NextResponse.json({ error: "Please verify your email before setting up payouts", _checkpoint: "email_not_verified", _detail: emailErr instanceof Error ? emailErr.message : String(emailErr) }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode; // "manage" for existing accounts
    const requestedCreatorCategory = typeof body?.creator_activity_category === "string"
      ? body.creator_activity_category
      : null;

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_account_id, creator_activity_category, first_name, last_name")
      .eq("user_id", user_id)
      .maybeSingle();

    if (error) {
      console.error("stripe/connect/session profile", error);
      return NextResponse.json({ error: "Failed to load profile", _checkpoint: "profile_fetch", _detail: error.message }, { status: 500 });
    }

    let stripeAccountId = profile?.stripe_account_id;
    let creatorActivityCategory = profile?.creator_activity_category ?? null;
    const firstName = profile?.first_name ?? null;
    const lastName = profile?.last_name ?? null;

    // Ensure a profiles row exists for this user
    if (!profile) {
      const { error: insErr } = await supabaseAdmin.from("profiles").upsert({ user_id, handle: user_id }, { onConflict: "user_id" });
      if (insErr) {
        console.error("stripe/connect/session upsert", insErr);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }
    }

    if (!mode || mode === "onboarding") {
      if (requestedCreatorCategory) {
        // Block prohibited businesses BEFORE touching Stripe
        if (isProhibitedCategory(requestedCreatorCategory)) {
          return NextResponse.json(
            { error: "This business type is not permitted on the 1neLink platform.", _checkpoint: "prohibited_category" },
            { status: 403 }
          );
        }

        const resolved = await getCreatorCategoryByName(requestedCreatorCategory);
        if (!resolved) {
          return NextResponse.json(
            { error: "Please select a valid creator activity category before starting Stripe onboarding.", _checkpoint: "category_resolve_failed", _detail: `No match for: "${requestedCreatorCategory}"` },
            { status: 400 }
          );
        }

        const canonicalCategory = resolved.name;
        // Set in-memory immediately — DB persist is best-effort (old constraint may still block)
        creatorActivityCategory = canonicalCategory;

        const { error: catErr } = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              user_id,
              handle: user_id,
              creator_activity_category: canonicalCategory,
            },
            { onConflict: "user_id" }
          );

        if (catErr) {
          // If the old check constraint is still active, log a warning and continue
          // (the session will still succeed; category persists once migration is applied)
          const isConstraintError = catErr.message?.includes("check constraint") || catErr.code === "23514";
          if (isConstraintError) {
            console.warn("stripe/connect/session: old category check constraint still active — skipping DB persist, continuing with in-memory value:", canonicalCategory);
          } else {
            console.error("stripe/connect/session save category", catErr);
            return NextResponse.json({ error: "Failed to save creator activity category", _checkpoint: "category_upsert", _detail: catErr.message }, { status: 500 });
          }
        }
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

    if (!stripeAccountId) {
      // Category is required only when creating a brand-new account.
      // Existing accounts already had the category applied at creation time.
      if (!isManageMode && !creatorActivityCategory) {
        return NextResponse.json(
          { error: "Please select your creator activity category before starting Stripe onboarding.", _checkpoint: "category_missing_after_upsert", _detail: `requestedCreatorCategory was: ${JSON.stringify(requestedCreatorCategory)}` },
          { status: 400 }
        );
      }
      let acct;
      try {
        acct = await stripe.accounts.create({
          type: "express",
          email: email,
          business_type: "individual",
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          settings: {
            payouts: {
              schedule: { interval: "manual" },
            },
          },
        });
      } catch (stripeCreateErr: unknown) {
        const msg = stripeCreateErr instanceof Error ? stripeCreateErr.message : String(stripeCreateErr);
        console.error("stripe/connect/session accounts.create error:", msg);
        return NextResponse.json({ error: "Failed to create Stripe account", _checkpoint: "stripe_accounts_create", _detail: msg }, { status: 502 });
      }

      stripeAccountId = acct.id;

      const { error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_account_id: stripeAccountId })
        .eq("user_id", user_id);

      if (updateErr) {
        console.error("stripe/connect/session save stripe_account_id", updateErr);
        return NextResponse.json({ error: "Failed to save Stripe account", _checkpoint: "save_stripe_account_id", _detail: updateErr.message }, { status: 500 });
      }
    } else {
      // Verify the stored Stripe account still exists (test-mode accounts can be deleted)
      try {
        await stripe.accounts.retrieve(stripeAccountId);
      } catch (retrieveErr: unknown) {
        const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
        if (msg.includes("No such account")) {
          // Stale account — clear it so we create a fresh one on next request
          await supabaseAdmin.from("profiles").update({ stripe_account_id: null }).eq("user_id", user_id);
          return NextResponse.json({ error: "Your Stripe account was not found. Please try again to create a new one.", _checkpoint: "stale_stripe_account", _detail: msg }, { status: 409 });
        }
        // Non-fatal retrieve error — log and continue
        console.warn("stripe/connect/session accounts.retrieve warning:", msg);
      }
    }

    // Fetch user's primary social/website URL for Stripe business_profile.url
    let userBusinessUrl: string | undefined;
    if (profile?.id) {
      const { data: socialLinks } = await supabaseAdmin
        .from("social_links")
        .select("type, url")
        .eq("profile_id", profile.id)
        .order("sort_order", { ascending: true });
      if (socialLinks && socialLinks.length > 0) {
        // Prefer website type, then fall back to first link
        const websiteLink = socialLinks.find((l: { type: string; url: string }) => l.type === "website");
        const candidate = (websiteLink ?? socialLinks[0]).url as string;
        // Only use if it looks like a valid URL
        if (candidate && /^https?:\/\/.+/.test(candidate)) {
          userBusinessUrl = candidate;
        }
      }
    }
    const stripeBusinessUrl = userBusinessUrl ?? "https://1nelink.com";

    // Keep account profile data aligned with selected creator activity for cleaner underwriting.
    if (creatorActivityCategory) {
      const creatorCategory = await getCreatorCategoryByName(creatorActivityCategory);
      if (!creatorCategory) {
        return NextResponse.json(
          { error: "Please select your creator activity category before starting Stripe onboarding.", _checkpoint: "category_resolve_prefill" },
          { status: 400 }
        );
      }

      const emailParts = (email || "").split("@");
      const resolvedFirstName = firstName || emailParts[0]?.split(".")[0] || "Creator";
      const resolvedLastName = lastName || emailParts[0]?.split(".")[1] || user_id.slice(0, 8);

      await stripe.accounts.update(stripeAccountId, {
        business_type: "individual",
        business_profile: {
          product_description: creatorCategory.stripe_description,
          mcc: "5815",
          url: stripeBusinessUrl,
        },
        individual: {
          email,
          first_name: resolvedFirstName,
          last_name: resolvedLastName,
        },
      }).catch((e) => {
        console.log("Failed to prefill connect session account data (non-blocking):", e instanceof Error ? e.message : e);
      });
    }

    // Use eventually_due so Stripe collects all required fields upfront in a
    // single session rather than requesting more info in subsequent sessions.
    const components = isManageMode
      ? { account_management: { enabled: true as const, features: { external_account_collection: true as const } } }
      : { account_onboarding: { enabled: true as const, features: { external_account_collection: true as const } } };

    let accountSession;
    try {
      accountSession = await stripe.accountSessions.create({
        account: stripeAccountId,
        components,
      });
    } catch (stripeSessionErr: unknown) {
      const msg = stripeSessionErr instanceof Error ? stripeSessionErr.message : String(stripeSessionErr);
      // If the stored account is from the wrong Stripe mode (live vs test), auto-repair:
      // clear it, create a fresh account, and retry the session once.
      const isStaleAccount = msg.includes("No such account") || msg.includes("live mode") || msg.includes("test mode");
      if (isStaleAccount) {
        console.warn("stripe/connect/session: stale/cross-mode account detected, auto-repairing:", stripeAccountId, msg);
        await supabaseAdmin.from("profiles").update({ stripe_account_id: null }).eq("user_id", user_id);
        try {
          const freshAcct = await stripe.accounts.create({
            type: "express",
            email: email,
            business_type: "individual",
            capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
            settings: {
              payouts: {
                schedule: { interval: "manual" },
              },
            },
          });
          await supabaseAdmin.from("profiles").update({ stripe_account_id: freshAcct.id }).eq("user_id", user_id);
          accountSession = await stripe.accountSessions.create({
            account: freshAcct.id,
            components,
          });
          stripeAccountId = freshAcct.id;
        } catch (repairErr: unknown) {
          const repairMsg = repairErr instanceof Error ? repairErr.message : String(repairErr);
          console.error("stripe/connect/session auto-repair failed:", repairMsg);
          return NextResponse.json({ error: "Failed to create Stripe session after account repair", _checkpoint: "stripe_account_sessions_repair", _detail: repairMsg }, { status: 502 });
        }
      } else {
        console.error("stripe/connect/session accountSessions.create error:", msg);
        return NextResponse.json({ error: "Failed to create Stripe session", _checkpoint: "stripe_account_sessions_create", _detail: msg }, { status: 502 });
      }
    }

    return NextResponse.json({ client_secret: accountSession.client_secret });
  } catch (e: unknown) {
    console.error("stripe/connect/session error:", e);
      return NextResponse.json({ error: "An error occurred. Please try again.", _checkpoint: "uncaught_exception", _detail: e instanceof Error ? `${e.message}\n${e.stack?.slice(0, 400)}` : String(e) }, { status: 500 });
  }
}
