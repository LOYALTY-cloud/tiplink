import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/types/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name: bodyName, email: bodyEmail, user_id: bodyUserId } = body || {};

    let userId: string | null = null;
    let actingAsAdmin = false;

    // If called by the retry worker, it will supply user_id and we use the admin client
    if (bodyUserId) {
      userId = bodyUserId;
      actingAsAdmin = true;
    } else {
      const supabase = await createSupabaseRouteClient();
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      userId = user.id;
    }

    // load profile (use admin client to bypass RLS)
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email, stripe_customer_id, stripe_cardholder_id, stripe_card_id")
      .eq("user_id", userId)
      .maybeSingle()
      .returns<ProfileRow | null>();

    // Duplicate-check: if any stripe ids present, skip to avoid duplicate creation
    if (prof && (prof.stripe_customer_id || prof.stripe_cardholder_id || prof.stripe_card_id)) {
      return NextResponse.json({ message: "Already onboarded, skipping" }, { status: 200 });
    }

    const name = bodyName ?? prof?.email ?? userId;
    const email = bodyEmail ?? prof?.email ?? undefined;

    // 1) create stripe customer
    const customer = await stripe.customers.create({ name, email });

    // 2) create issuing cardholder
    const cardholder = await stripe.issuing.cardholders.create({
      type: "individual",
      name,
      email,
      billing: {
        address: {
          line1: "Unknown",
          city: "Unknown",
          postal_code: "00000",
          country: "US",
        },
      },
    });

    // 3) create virtual card
    const card = await stripe.issuing.cards.create({
      cardholder: cardholder.id,
      currency: "usd",
      type: "virtual",
    });

    // save to profiles and create wallet using admin client
    await supabaseAdmin.from("profiles").upsert(
      {
        user_id: userId,
        stripe_customer_id: customer.id,
        stripe_cardholder_id: cardholder.id,
        stripe_card_id: card.id,
      },
      { onConflict: "user_id" }
    );

    await supabaseAdmin.from("wallets").upsert(
      { user_id: userId, balance: 0, currency: "usd", available: 0, pending: 0 },
      { onConflict: "user_id" }
    );
    return NextResponse.json({ customerId: customer.id, cardholderId: cardholder.id, cardId: card.id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
