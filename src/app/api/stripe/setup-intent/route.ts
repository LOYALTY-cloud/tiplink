import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";

export async function POST() {
  const si = await stripe.setupIntents.create({
    payment_method_types: ["card"],
    usage: "off_session",
  });

  return NextResponse.json({ clientSecret: si.client_secret });
}
