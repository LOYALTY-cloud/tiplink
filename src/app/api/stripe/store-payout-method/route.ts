import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { userId, paymentMethodId } = await req.json();

  if (!userId || !paymentMethodId) {
    return NextResponse.json(
      { error: "Missing userId/paymentMethodId" },
      { status: 400 }
    );
  }

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

  const brand = (pm as unknown)?.card?.brand ?? null;
  const last4 = (pm as unknown)?.card?.last4 ?? null;

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
