import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();
    if (!cardId) return NextResponse.json({ error: "Missing cardId" }, { status: 400 });

    const card = await stripe.issuing.cards.retrieve(cardId as string);
    return NextResponse.json(card);
  } catch (err: unknown) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
