import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  // ── Input ────────────────────────────────────────────────────────────────
  let payment_intent_id: unknown;
  try {
    ({ payment_intent_id } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof payment_intent_id !== "string" || !payment_intent_id.startsWith("pi_")) {
    return NextResponse.json({ error: "Invalid payment_intent_id" }, { status: 400 });
  }

  // ── Retrieve PaymentIntent from Stripe — NEVER trust client ─────────────
  const { stripe } = await import("@/lib/stripe/server");
  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
  try {
    pi = await stripe.paymentIntents.retrieve(payment_intent_id);
  } catch {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (pi.status !== "succeeded") {
    return NextResponse.json({ error: "Payment has not succeeded" }, { status: 400 });
  }

  const meta = pi.metadata ?? {};
  if (meta.type !== "custom_theme_purchase") {
    return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
  }
  // Verify the authenticated user is the buyer recorded in the PaymentIntent
  if (meta.buyer_id !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const themeId = meta.theme_id;
  const sellerId = meta.seller_id;

  if (!themeId || !sellerId) {
    return NextResponse.json({ error: "Invalid payment metadata" }, { status: 400 });
  }

  const amountDollars = (pi.amount_received > 0 ? pi.amount_received : pi.amount) / 100;
  const feeCents = parseInt(meta.platform_fee_cents ?? "0", 10);
  const platformFee = feeCents / 100;
  const creatorEarns = Math.max(0, Number((amountDollars - platformFee).toFixed(2)));

  // ── Idempotent: already unlocked? ────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("theme_unlocks")
    .select("id")
    .eq("user_id", userId)
    .eq("theme_id", themeId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, already_owned: true, theme_id: themeId });
  }

  // ── Theme snapshot ───────────────────────────────────────────────────────
  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select("id, user_id, name, config, parent_theme_id, version")
    .eq("id", themeId)
    .maybeSingle();

  const payoutSellerId = theme?.user_id ?? sellerId;
  if (payoutSellerId === userId) {
    return NextResponse.json({ error: "Cannot purchase own theme" }, { status: 400 });
  }

  // ── Insert theme_unlocks ─────────────────────────────────────────────────
  const { error: unlockErr } = await supabaseAdmin
    .from("theme_unlocks")
    .upsert(
      {
        user_id: userId,
        theme_id: themeId,
        creator_id: payoutSellerId,
        theme_name: theme?.name ?? null,
        theme_config: theme?.config ?? null,
        parent_theme_id: theme?.parent_theme_id ?? null,
        theme_version: typeof theme?.version === "number" ? theme.version : 1,
        unlocked_via: "payment",
        source: "payment",
        amount_paid: amountDollars,
      },
      { onConflict: "user_id,theme_id", ignoreDuplicates: true }
    );

  if (unlockErr) {
    console.error("confirm-purchase: theme_unlocks upsert error", unlockErr);
    return NextResponse.json({ error: "Failed to unlock theme" }, { status: 500 });
  }

  // ── Record theme activity ────────────────────────────────────────────────
  await supabaseAdmin
    .from("user_theme_activity")
    .insert({
      user_id: userId,
      theme_id: themeId,
      creator_id: payoutSellerId,
      action: "purchase",
      category_slug: null,
      animation_type:
        theme?.config && typeof theme.config === "object"
          ? ((theme.config as Record<string, unknown>).motion as string | null) ??
            ((theme.config as Record<string, unknown>).animationType as string | null) ??
            null
          : null,
      price: amountDollars,
    });

  // ── Insert theme_sales revenue record ─────────────────────────────────────
  // Uses payment_intent id as stripe_session_id for unique tracking.
  // Upsert on stripe_session_id to be idempotent on double-submit.
  // AWAITED — if this fails, creator won't get paid. Alert admin.
  const { error: salesErr } = await supabaseAdmin
    .from("theme_sales")
    .upsert(
      {
        theme_id: themeId,
        buyer_id: userId,
        seller_id: payoutSellerId,
        stripe_session_id: pi.id,
        amount: amountDollars,
        platform_fee: platformFee,
        creator_earnings: creatorEarns,
      },
      { onConflict: "stripe_session_id", ignoreDuplicates: true }
    );

  if (salesErr) {
    console.error("confirm-purchase: theme_sales upsert FAILED — creator earnings not recorded", {
      themeId,
      buyerId: userId,
      sellerId: payoutSellerId,
      piId: pi.id,
      error: salesErr.message,
    });
    // Theme is already unlocked — do NOT block the user response.
    // But fire an admin alert so the revenue record can be manually reconciled.
    try {
      const { sendAdminAlert } = await import("@/lib/adminAlerts");
      sendAdminAlert({
        subject: "confirm-purchase: theme_sales insert failed",
        body: `Creator ${payoutSellerId} may be missing earnings for theme ${themeId} (buyer ${userId}, PI ${pi.id}).`,
        severity: "critical",
        meta: { themeId, buyerId: userId, sellerId: payoutSellerId, piId: pi.id, error: salesErr.message },
      });
    } catch (_) {}
  }

  // ── Increment unlock counter (best-effort) ───────────────────────────────
  void supabaseAdmin
    .rpc("increment_theme_unlock", { theme_id_input: themeId });

  // ── Notify creator + buyer (best-effort) ─────────────────────────────────
  try {
    const { createNotification } = await import("@/lib/notifications");
    void createNotification({
      userId: payoutSellerId,
      type: "theme_sold",
      title: "Theme sold 🎉",
      body: `${theme?.name ?? "Your theme"} was purchased`,
      category: "sales",
      actorId: userId,
      entityId: themeId,
      meta: { amount: amountDollars },
    });
    void createNotification({
      userId,
      type: "theme_unlocked",
      title: "Theme unlocked 🎨",
      body: `${theme?.name ?? "A theme"} has been added to your library`,
      category: "sales",
      actorId: payoutSellerId,
      entityId: themeId,
    });
  } catch (_) {}

  return NextResponse.json({ success: true, theme_id: themeId });
}
