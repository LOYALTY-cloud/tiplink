import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveThemePrice } from "@/lib/themePricing";

export const runtime = "nodejs";

type ThemeRow = {
  id: string;
  parent_theme_id: string | null;
  price: number | null;
  base_price: number | null;
  upgrade_price: number | null;
};

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const themeIds = Array.isArray(body.theme_ids)
      ? body.theme_ids.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];

    if (themeIds.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    const { data: themes, error: themesErr } = await supabaseAdmin
      .from("themes")
      .select("id, parent_theme_id, price, base_price, upgrade_price")
      .in("id", themeIds)
      .eq("is_public", true)
      .or("is_market_active.eq.true,is_market_active.is.null");

    if (themesErr) {
      console.error("themes/market-pricing themes:", themesErr);
      return NextResponse.json({ error: "Failed to load market pricing" }, { status: 500 });
    }

    const themeById = new Map<string, ThemeRow>((themes ?? []).map((t) => [t.id, t as ThemeRow]));
    const parentCache = new Map<string, string | null>();
    for (const t of themes ?? []) parentCache.set(t.id, t.parent_theme_id as string | null);

    const { data: unlocks, error: unlockErr } = await supabaseAdmin
      .from("theme_unlocks")
      .select("theme_id")
      .eq("user_id", userId)
      .not("theme_id", "is", null);

    if (unlockErr) {
      console.error("themes/market-pricing unlocks:", unlockErr);
      return NextResponse.json({ error: "Failed to load ownership" }, { status: 500 });
    }

    const ownedIds = new Set((unlocks ?? []).map((u) => u.theme_id as string).filter(Boolean));

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

    const getAncestorIds = async (startParent: string | null) => {
      const ids: string[] = [];
      let cursor = startParent;
      let guard = 0;
      while (cursor && guard < 30) {
        ids.push(cursor);
        cursor = await getParentId(cursor);
        guard += 1;
      }
      return ids;
    };

    const prices: Record<string, { type: "owned" | "upgrade" | "full"; price: number }> = {};

    for (const themeId of themeIds) {
      const theme = themeById.get(themeId);
      if (!theme) continue;

      const basePrice = Number(theme.base_price ?? theme.price ?? 0);
      if (!Number.isFinite(basePrice) || basePrice <= 0) continue;

      const ancestorIds = await getAncestorIds(theme.parent_theme_id);
      const isOwnedLatest = ownedIds.has(theme.id);
      const qualifiesUpgrade = ancestorIds.some((id) => ownedIds.has(id));

      const resolved = resolveThemePrice({
        basePrice,
        upgradePrice: typeof theme.upgrade_price === "number" ? theme.upgrade_price : null,
        isOwnedLatest,
        qualifiesUpgrade,
      });

      prices[themeId] = resolved;
    }

    return NextResponse.json({ prices });
  } catch (err) {
    console.error("themes/market-pricing unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
