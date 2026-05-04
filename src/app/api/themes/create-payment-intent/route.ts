import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveThemePrice } from "@/lib/themePricing";

export const runtime = "nodejs";

const PLATFORM_FEE_RATE = 0.015; // 1.5% platform cut

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
  let theme_id: unknown;
  try {
    ({ theme_id } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof theme_id !== "string" || !theme_id.trim()) {
    return NextResponse.json({ error: "theme_id is required" }, { status: 400 });
  }

  // ── NEVER trust client price — load from DB ──────────────────────────────
  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select(
      "id, user_id, name, price, base_price, upgrade_price, parent_theme_id, is_public, is_market_active"
    )
    .eq("id", theme_id)
    .eq("is_public", true)
    .or("is_market_active.eq.true,is_market_active.is.null")
    .maybeSingle();

  if (!theme) {
    return NextResponse.json(
      { error: "Theme not found or not listed for sale" },
      { status: 404 }
    );
  }

  const basePrice = Number(theme.base_price ?? theme.price ?? 0);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return NextResponse.json({ error: "This theme has no purchase price" }, { status: 400 });
  }
  if (theme.user_id === userId) {
    return NextResponse.json({ error: "You cannot purchase your own theme" }, { status: 400 });
  }

  // ── Already unlocked? ────────────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("theme_unlocks")
    .select("id")
    .eq("user_id", userId)
    .eq("theme_id", theme_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, already_owned: true, theme_id });
  }

  // ── Resolve upgrade vs full price ────────────────────────────────────────
  const ownedRows = await supabaseAdmin
    .from("theme_unlocks")
    .select("theme_id")
    .eq("user_id", userId)
    .not("theme_id", "is", null);

  const ownedIds = new Set(
    (ownedRows.data ?? []).map((r) => r.theme_id as string).filter(Boolean)
  );

  const ancestorIds: string[] = [];
  let cursor = (theme.parent_theme_id as string | null) ?? null;
  let guard = 0;
  while (cursor && guard < 30) {
    ancestorIds.push(cursor);
    const { data: parent } = await supabaseAdmin
      .from("themes")
      .select("parent_theme_id")
      .eq("id", cursor)
      .maybeSingle();
    cursor = (parent?.parent_theme_id as string | null) ?? null;
    guard++;
  }

  const priceInfo = resolveThemePrice({
    basePrice,
    upgradePrice: typeof theme.upgrade_price === "number" ? theme.upgrade_price : null,
    isOwnedLatest: ownedIds.has(theme.id),
    qualifiesUpgrade: ancestorIds.some((id) => ownedIds.has(id)),
  });

  if (priceInfo.type === "owned") {
    return NextResponse.json({ success: true, already_owned: true, theme_id });
  }

  // ── Create Stripe PaymentIntent ───────────────────────────────────────────
  const { stripe } = await import("@/lib/stripe/server");
  const unitAmount = Math.round(priceInfo.price * 100);
  const feeAmount = Math.round(unitAmount * PLATFORM_FEE_RATE);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: unitAmount,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      type: "custom_theme_purchase",
      buyer_id: userId,
      seller_id: theme.user_id as string,
      theme_id: theme.id,
      purchase_price_type: priceInfo.type,
      platform_fee_cents: String(feeAmount),
    },
  });

  return NextResponse.json({ clientSecret: paymentIntent.client_secret });
}
