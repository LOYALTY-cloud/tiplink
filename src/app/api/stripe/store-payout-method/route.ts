import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";


export async function POST(req: Request) {
  const { userId, paymentMethodId } = await req.json();

  if (!userId || !paymentMethodId) {
    return NextResponse.json(
      { error: "Missing userId/paymentMethodId" },
      { status: 400 }
    );
  }

  const stripe = getStripe();

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

  const brand = (pm as any)?.card?.brand ?? null;
  const last4 = (pm as any)?.card?.last4 ?? null;

  await supabaseAdmin
    .from("payout_methods")
    .update({ is_default: false })
    .eq("user_id", userId);

  const { error } = await supabaseAdmin.from("payout_methods").insert({
    user_id: userId,
    provider: "stripe",
    provider_ref: paymentMethodId,
    type: "debit",
    brand,
    last4,
    is_default: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, brand, last4 });
}
