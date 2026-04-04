import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/server";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";

export const runtime = "nodejs";

const supabase = createClient(
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

    // Require verified email before Stripe onboarding/management
    try {
      await requireVerifiedEmail(user_id);
    } catch {
      return NextResponse.json({ error: "Please verify your email before setting up payouts" }, { status: 403 });
    }

    const body = await req.json();
    const mode = body?.mode; // "manage" for existing accounts

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let stripeAccountId = profile?.stripe_account_id;

    // Ensure a profiles row exists for this user
    if (!profile) {
      const { error: insErr } = await supabase.from("profiles").upsert({ user_id, handle: user_id }, { onConflict: "user_id" });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // Fetch email from Supabase Auth (admin) — profiles table doesn't store email
    const { data: authUserRes, error: authUserErr } = await supabase.auth.admin.getUserById(user_id);
    if (authUserErr) return NextResponse.json({ error: authUserErr.message }, { status: 500 });

    const email = authUserRes?.user?.email ?? undefined;

    if (!stripeAccountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });

      stripeAccountId = acct.id;

      await supabase
        .from("profiles")
        .update({ stripe_account_id: stripeAccountId })
        .eq("user_id", user_id);
    }

    const components = mode === "manage"
      ? { account_management: { enabled: true as const } }
      : { account_onboarding: { enabled: true as const } };

    const accountSession = await stripe.accountSessions.create({
      account: stripeAccountId,
      components,
    });

    return NextResponse.json({ client_secret: accountSession.client_secret });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
