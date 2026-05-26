import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Unlock a free marketplace theme (base_price = 0) without payment.
 * Inserts a row into theme_unlocks and increments unlock_count.
 */
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
  try {
    ({ theme_id } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof theme_id !== "string" || !theme_id.trim()) {
    return NextResponse.json({ error: "theme_id is required" }, { status: 400 });
  }

  // ── Verify theme is free, public, and listed ────────────────────────────────
  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select("id, user_id, name, base_price, config, parent_theme_id, version, is_public, is_market_active")
    .eq("id", theme_id)
    .eq("is_public", true)
    .or("is_market_active.eq.true,is_market_active.is.null")
    .maybeSingle();

  if (!theme) {
    return NextResponse.json({ error: "Theme not found or not listed" }, { status: 404 });
  }

  const basePrice = Number(theme.base_price ?? 0);
  if (basePrice > 0) {
    return NextResponse.json({ error: "This theme requires payment" }, { status: 400 });
  }

  if (theme.user_id === userId) {
    return NextResponse.json({ error: "You cannot unlock your own theme" }, { status: 400 });
  }

  // -- Block unlocks from admin-disabled stores ---------------------------------
  if (theme.user_id) {
    const { data: creatorProfile } = await supabaseAdmin
      .from("profiles")
      .select("store_disabled")
      .eq("user_id", theme.user_id)
      .maybeSingle();
    if (creatorProfile?.store_disabled) {
      return NextResponse.json({ error: "This theme is no longer available" }, { status: 404 });
    }
  }

  // ── Idempotent: already unlocked? ───────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("theme_unlocks")
    .select("id")
    .eq("user_id", userId)
    .eq("theme_id", theme_id)
    .maybeSingle();

  if (existing) {
    // Already owned — treat as success so client can redirect
    return NextResponse.json({ success: true, already_owned: true });
  }

  // ── Insert unlock ────────────────────────────────────────────────────────────
  const { error: insertErr } = await supabaseAdmin
    .from("theme_unlocks")
    .insert({
      user_id: userId,
      theme_id,
      creator_id: theme.user_id ?? null,
      theme_name: theme.name ?? null,
      theme_config: theme.config ?? null,
      parent_theme_id: (theme as Record<string, unknown>).parent_theme_id as string ?? null,
      theme_version: typeof (theme as Record<string, unknown>).version === "number" ? (theme as Record<string, unknown>).version as number : 1,
      source: "free_market",
      unlocked_via: "free_market",
      amount_paid: 0,
    });

  if (insertErr) {
    console.error("market-free-unlock insert error:", insertErr);
    return NextResponse.json({ error: "Failed to unlock theme" }, { status: 500 });
  }

  // Track activity (best-effort)
  void supabaseAdmin
    .from("user_theme_activity")
    .insert({ user_id: userId, theme_id, action: "free_unlock", price: 0 });

  // Increment unlock_count (best-effort)
  void supabaseAdmin
    .rpc("increment_theme_unlock", { theme_id_input: theme_id });

  // ── Notifications (best-effort) ───────────────────────────────────────────
  try {
    const { createNotification } = await import("@/lib/notifications");
    // Notify creator that their free theme was claimed
    if (theme.user_id && theme.user_id !== userId) {
      void createNotification({
        userId: theme.user_id,
        type: "theme_sold",
        title: "Theme claimed 🎨",
        body: `${theme.name ?? "Your theme"} was claimed for free`,
        category: "sales",
        actorId: userId,
        entityId: theme_id,
      });
    }
    // Notify buyer
    void createNotification({
      userId,
      type: "theme_unlocked",
      title: "Free theme unlocked 🎉",
      body: `${theme.name ?? "A theme"} has been added to your library`,
      category: "sales",
      actorId: theme.user_id ?? undefined,
      entityId: theme_id,
    });
  } catch (_) {}

  return NextResponse.json({ success: true });
}
