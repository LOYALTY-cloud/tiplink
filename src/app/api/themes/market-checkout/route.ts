import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveThemePrice } from "@/lib/themePricing";

export const runtime = "nodejs";

const PLATFORM_FEE_RATE = 0.015; // 1.5% platform cut

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  // ── Input ───────────────────────────────────────────────────────────────────
  let theme_id: unknown;
  let cancel_return: unknown;
  try {
    ({ theme_id, cancel_return } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof theme_id !== "string" || !theme_id.trim()) {
    return NextResponse.json({ error: "theme_id is required" }, { status: 400 });
  }
  // Optional: caller can pass a cancel_return path (e.g. "/store" or "/store/creator-slug")
  const cancelPath =
    typeof cancel_return === "string" && cancel_return.startsWith("/")
      ? cancel_return
      : "/store";

  // ── Verify theme exists and is for sale ─────────────────────────────────────
  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select("id, user_id, name, price, base_price, upgrade_price, parent_theme_id, is_public, is_market_active")
    .eq("id", theme_id)
    .eq("is_public", true)
    .or("is_market_active.eq.true,is_market_active.is.null")
    .maybeSingle();

  if (!theme) {
    return NextResponse.json({ error: "Theme not found or not listed for sale" }, { status: 404 });
  }
  const basePrice = Number(theme.base_price ?? theme.price ?? 0);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return NextResponse.json({ error: "This theme has no purchase price" }, { status: 400 });
  }
  if (theme.user_id === userId) {
    return NextResponse.json({ error: "You cannot purchase your own theme" }, { status: 400 });
  }

  // ── Idempotent: already unlocked? ───────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("theme_unlocks")
    .select("id")
    .eq("user_id", userId)
    .eq("theme_id", theme_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You already own this theme" }, { status: 400 });
  }

  const ownedThemeRows = await supabaseAdmin
    .from("theme_unlocks")
    .select("theme_id")
    .eq("user_id", userId)
    .not("theme_id", "is", null);

  const ownedIds = new Set((ownedThemeRows.data ?? []).map((r) => r.theme_id as string).filter(Boolean));

  const parentCache = new Map<string, string | null>();
  const getParentId = async (themeId: string): Promise<string | null> => {
    if (parentCache.has(themeId)) return parentCache.get(themeId) ?? null;
    const { data } = await supabaseAdmin
      .from("themes")
      .select("id, parent_theme_id")
      .eq("id", themeId)
      .maybeSingle();
    const parent = (data?.parent_theme_id as string | null) ?? null;
    parentCache.set(themeId, parent);
    return parent;
  };

  const ancestorIds: string[] = [];
  let cursor = (theme.parent_theme_id as string | null) ?? null;
  let guard = 0;
  while (cursor && guard < 30) {
    ancestorIds.push(cursor);
    cursor = await getParentId(cursor);
    guard += 1;
  }

  const priceInfo = resolveThemePrice({
    basePrice,
    upgradePrice: typeof theme.upgrade_price === "number" ? theme.upgrade_price : null,
    isOwnedLatest: ownedIds.has(theme.id),
    qualifiesUpgrade: ancestorIds.some((id) => ownedIds.has(id)),
  });

  if (priceInfo.type === "owned") {
    return NextResponse.json({ error: "You already own this theme" }, { status: 400 });
  }

  // ── Create Stripe Checkout session ──────────────────────────────────────────
  const { stripe } = await import("@/lib/stripe/server");

  const unitAmount = Math.round(priceInfo.price * 100); // cents
  const feeAmount = Math.round(unitAmount * PLATFORM_FEE_RATE);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: priceInfo.type === "upgrade" ? `${theme.name} (Upgrade)` : theme.name },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "custom_theme_purchase",
      buyer_id: userId,
      seller_id: theme.user_id,
      theme_id: theme.id,
      purchase_price_type: priceInfo.type,
      // Store cents so the webhook doesn't have to recalculate
      platform_fee_cents: String(feeAmount),
    },
    success_url: `${siteUrl}/dashboard/mythemes?theme_unlocked=${theme.id}`,
    cancel_url: `${siteUrl}${cancelPath}`,
  });

  return NextResponse.json({ url: session.url });
}
