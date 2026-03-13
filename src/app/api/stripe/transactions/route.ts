import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();
    if (!cardId) return NextResponse.json({ error: "Missing cardId" }, { status: 400 });

    const transactions = await stripe.issuing.transactions.list({
      card: cardId as string,
      limit: 10,
    });

    return NextResponse.json(transactions.data);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
