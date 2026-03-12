import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { cardId, action } = await req.json();
    if (!cardId) return NextResponse.json({ error: "Missing cardId" }, { status: 400 });

    const status = action === "unfreeze" ? "active" : "inactive";
    const card = await stripe.issuing.cards.update(cardId as string, { status });
    return NextResponse.json(card);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
