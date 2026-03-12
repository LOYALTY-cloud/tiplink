import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export async function createUserWithCard(userId: string, email: string) {
  // 1) Create issuing cardholder
  const cardholder = await stripe.issuing.cardholders.create({
    type: "individual",
    name: email,
    email,
    billing: {
      address: {
        line1: "Unknown",
        city: "Unknown",
        postal_code: "00000",
        country: "US",
      },
    },
  });

  // 2) Create virtual card
  const card = await stripe.issuing.cards.create({
    cardholder: cardholder.id,
    currency: "usd",
    type: "virtual",
  });

  // 3) Persist to Supabase
  await supabaseAdmin.from("profiles").upsert(
    {
      user_id: userId,
      email,
      stripe_cardholder_id: cardholder.id,
      stripe_card_id: card.id,
    },
    { onConflict: "user_id" }
  );

  try {
    await supabaseAdmin.from("cards").upsert(
      {
        user_id: userId,
        stripe_card_id: card.id,
        brand: (card as unknown).brand ?? null,
        last4: (card as unknown).last4 ?? null,
        status: card.status ?? null,
      },
      { onConflict: "stripe_card_id" }
    );
  } catch (err) {
    // Non-fatal if cards table isn't present yet
  }

  // 4) Ensure wallet exists
  try {
    await supabaseAdmin.from("wallets").upsert({ user_id: userId, balance: 0, currency: "usd", available: 0, pending: 0 }, { onConflict: "user_id" });
  } catch (err) {}

  return { cardholder, card };
}

export default createUserWithCard;
