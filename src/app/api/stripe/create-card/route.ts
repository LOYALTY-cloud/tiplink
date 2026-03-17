import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cardholderId } = body;

    const supabase = await createSupabaseRouteClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    let chId = cardholderId;
    if (!chId) {
      // try to read from profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("stripe_cardholder_id, account_status")
        .eq("user_id", user.id)
        .maybeSingle()
        .returns<ProfileRow | null>();
      // Block card creation if account not active
      if (prof?.account_status && prof.account_status !== "active") {
        return NextResponse.json({ error: "Account not allowed to create cards" }, { status: 403 });
      }
      chId = prof?.stripe_cardholder_id ?? undefined;
    }

    if (!chId) return NextResponse.json({ error: "Missing cardholderId" }, { status: 400 });

    const card = await stripe.issuing.cards.create({
      cardholder: chId,
      currency: "usd",
      type: "virtual",
    });

    // Save stripe_card_id to profile
    await supabase.from("profiles").upsert({ user_id: user.id, stripe_card_id: card.id }, { onConflict: "user_id" });

    return NextResponse.json(card);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
