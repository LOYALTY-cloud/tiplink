import { NextResponse } from "next/server";
import { requireCreator } from "@/lib/creatorGuard";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const STORE_PRICE_CENTS = 999;

/**
 * POST /api/store/switch-to-stripe
 * Starts Stripe subscription checkout for creators currently using balance billing.
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId, owner_elite } = session;

  if (owner_elite) {
    return NextResponse.json(
      { error: "Owner Elite store is permanently free and cannot be switched to paid billing." },
      { status: 403 }
    );
  }

  let { data: store, error } = await supabaseAdmin
    .from("creator_stores")
    .select("id, is_active, billing_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const fallback = await supabaseAdmin
      .from("creator_stores")
      .select("id, is_active, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    store = fallback.data as typeof store;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: "Failed to load store" }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }
  if (!store.is_active) {
    return NextResponse.json({ error: "Store must be active before switching billing." }, { status: 400 });
  }
  const billingType = store.billing_type ?? ((store as { stripe_subscription_id?: string | null }).stripe_subscription_id ? "stripe" : "balance");

  if (billingType === "stripe") {
    return NextResponse.json({ already_stripe: true });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: STORE_PRICE_CENTS,
          recurring: { interval: "month" },
          product_data: { name: "TipLink Store Subscription" },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "store_subscription",
      user_id: userId,
      store_id: store.id,
      switch: "to_stripe",
    },
    subscription_data: {
      metadata: {
        type: "store_subscription",
        user_id: userId,
        store_id: store.id,
      },
    },
    success_url: `${siteUrl}/dashboard/themebuilder?billing=success`,
    cancel_url: `${siteUrl}/dashboard/themebuilder`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
