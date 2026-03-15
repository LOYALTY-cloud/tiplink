import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/types/db";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Check existing stripe account
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

    let accountId = prof?.stripe_account_id as string | null;

    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        country: "US",
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

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: `${baseUrl}/dashboard/stripe/return`,
      refresh_url: `${baseUrl}/dashboard/stripe/refresh`,
    });

    return NextResponse.json({ url: accountLink.url, accountId });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
