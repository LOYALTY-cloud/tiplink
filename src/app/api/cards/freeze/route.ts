import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/safeServerClient";
import { getStripe } from "@/lib/stripe/server";

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();
    if (!cardId) return NextResponse.json({ error: "Missing cardId" }, { status: 400 });

    // Lazy-init Stripe and Supabase inside handler to avoid build-time secrets access
    try {
      const stripe = getStripe();
      await stripe.issuing.cards.update(cardId, { status: "inactive" });
    } catch (e) {
      console.error("Stripe freeze failed:", e);
    }

    // Update DB
    try {
      const supabaseAdmin = getSupabaseServerClient();
      await supabaseAdmin.from("cards").update({ status: "inactive" }).eq("stripe_card_id", cardId);
    } catch (e) {
      console.error("DB freeze update failed:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
