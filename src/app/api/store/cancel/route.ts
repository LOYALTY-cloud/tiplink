import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

/**
 * POST /api/store/cancel
 * Deactivates creator store and cancels Stripe subscription if applicable.
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId, owner_elite } = session;

  // Owner Elite stores are permanently free and should never be deactivated.
  if (owner_elite) {
    return NextResponse.json(
      { error: "Owner Elite store is permanently free and cannot be canceled." },
      { status: 403 }
    );
  }

  let { data: store, error: fetchErr } = await supabaseAdmin
    .from("creator_stores")
    .select("id, stripe_subscription_id, billing_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    const fallback = await supabaseAdmin
      .from("creator_stores")
      .select("id, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    store = fallback.data as typeof store;
    fetchErr = fallback.error;
  }

  if (fetchErr) {
    return NextResponse.json({ error: "Failed to load store" }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const billingType = store.billing_type ?? (store.stripe_subscription_id ? "stripe" : "balance");

  if (billingType === "stripe" && store.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(store.stripe_subscription_id);
    } catch (e) {
      console.error("store/cancel stripe cancel:", e);
      return NextResponse.json({ error: "Failed to cancel card subscription" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();

  let { error: deactivateErr } = await supabaseAdmin
    .from("creator_stores")
    .update({
      is_active: false,
      billing_status: "canceled",
      grace_until: null,
      stripe_subscription_id: null,
      renews_at: null,
      updated_at: now,
    })
    .eq("id", store.id);

  if (deactivateErr) {
    const fallback = await supabaseAdmin
      .from("creator_stores")
      .update({
        is_active: false,
        stripe_subscription_id: null,
        updated_at: now,
      })
      .eq("id", store.id);
    deactivateErr = fallback.error;
  }

  if (deactivateErr) {
    return NextResponse.json({ error: "Failed to cancel store" }, { status: 500 });
  }

  // Hide themes from the store feed — keep store_id so they auto-restore on renewal
  await supabaseAdmin
    .from("themes")
    .update({ is_market_active: false, is_public: false })
    .eq("store_id", store.id)
    .eq("user_id", userId);

  return NextResponse.json({ success: true });
}
