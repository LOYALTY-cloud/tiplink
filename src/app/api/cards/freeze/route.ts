import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/safeServerClient";
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
    const supabaseAdmin = getSupabaseServerClient();
    await supabaseAdmin.from("cards").update({ status: "inactive" }).eq("stripe_card_id", cardId);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
