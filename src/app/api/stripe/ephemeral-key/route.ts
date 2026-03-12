import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();
    if (!cardId) return NextResponse.json({ error: "Missing cardId" }, { status: 400 });

    const supabase = await createSupabaseRouteClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Ensure the user owns the card
    const { data: prof } = await supabase.from("profiles").select("stripe_card_id").eq("user_id", user.id).maybeSingle();
    if (!prof || (prof as any).stripe_card_id !== cardId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Create an ephemeral key scoped to the issuing card for Elements
    const ephemeralKey = await stripe.ephemeralKeys.create(
      // `associated_objects` typing varies between SDK versions; cast to any
      { associated_objects: [{ type: "issuing_card", id: cardId }] } as any,
      // request options typing differs between SDK versions; cast to any
      ({ stripeVersion: "2026-02-25.clover" } as any)
    );

    return NextResponse.json(ephemeralKey);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
