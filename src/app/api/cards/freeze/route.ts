import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();
    if (!cardId) return NextResponse.json({ error: "Missing cardId" }, { status: 400 });

    // Update Stripe
    try {
      await stripe.issuing.cards.update(cardId, { status: "inactive" });
    } catch (e) {
      console.error("Stripe freeze failed:", e);
    }

    // Update DB
    await supabaseAdmin.from("cards").update({ status: "inactive" }).eq("stripe_card_id", cardId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
