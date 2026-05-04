import { NextResponse } from "next/server";
import { requireCreator } from "@/lib/creatorGuard";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/store/retry-payment
 * Opens Stripe Billing Portal so creators can retry failed card payments.
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const { data: store, error } = await supabaseAdmin
    .from("creator_stores")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load store billing profile" }, { status: 500 });
  }

  if (!store?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active card subscription found" }, { status: 400 });
  }

  const sub = await stripe.subscriptions.retrieve(store.stripe_subscription_id);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  if (!customerId) {
    return NextResponse.json({ error: "Missing Stripe customer for this subscription" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/dashboard/themebuilder`,
  });

  return NextResponse.json({ url: portal.url });
}
