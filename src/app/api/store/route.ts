import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRecommendedThemes, type ThemeActivityRecord } from "@/lib/themeRecommendations";
import { CURATED_THEME_CATEGORIES } from "@/lib/themeCategories";

export const runtime = "nodejs";

type CreatorStoreRow = {
  slug: string;
  store_name: string | null;
  featured: boolean | null;
  category: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  theme_count?: number;
  preview_theme_config?: Record<string, unknown> | null;
};

type StoreJoin = {
  store_name: string | null;
  slug: string | null;
  featured?: boolean | null;
  total_sales?: number | null;
  is_active?: boolean | null;
};

type CategoryJoin = {
  name: string | null;
  slug: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tab = (searchParams.get("tab") ?? "trending").toLowerCase();
  const category = (searchParams.get("category") ?? "all").toLowerCase();
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();

  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
  let userId: string | null = null;
  if (token) {
    const { data } = await supabaseAdmin.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }

  // Fetch blocked creator user_ids: non-active accounts OR admin-disabled stores
  const { data: blockedRows } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .or("account_status.neq.active,store_disabled.eq.true");
  const blockedUserIds = new Set((blockedRows ?? []).map((r) => r.user_id));

  const { data: themeRows, error: themesErr } = await supabaseAdmin
    .from("themes")
    .select("user_id, id, name, base_price, price, upgrade_price, unlock_count, is_verified, created_at, config, category:theme_categories(name, slug), store:creator_stores(store_name, slug, featured, total_sales, is_active)")
    .eq("is_public", true)
    .eq("is_market_active", true)
    .eq("status", "approved")
    .not("store_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (themesErr) {
    console.error("store feed themes:", themesErr);
    return NextResponse.json({ error: "Failed to load themes" }, { status: 500 });
  }

  const themes = (themeRows ?? [])
    .map((row) => {
      const store = one(row.store as StoreJoin | StoreJoin[] | null);
      const cat = one(row.category as CategoryJoin | CategoryJoin[] | null);

      // Only surface themes from stores with an active subscription and non-blocked creators
      if (!store?.slug || !store?.is_active) return null;
      if (row.user_id && blockedUserIds.has(row.user_id)) return null;

      return {
        id: row.id,
        name: row.name,
        base_price: Number(row.base_price ?? row.price ?? 0),
        upgrade_price: typeof row.upgrade_price === "number" ? row.upgrade_price : null,
        unlock_count: row.unlock_count ?? 0,
        created_at: typeof row.created_at === "string" ? row.created_at : null,
        is_verified: row.is_verified === true,
        config: (row.config ?? {}) as Record<string, unknown>,
        category: cat
          ? {
              name: cat.name,
              slug: cat.slug,
            }
          : null,
        store: {
          name: store.store_name ?? "Creator Store",
          slug: store.slug,
          featured: store.featured === true,
          total_sales: store.total_sales ?? 0,
        },
      };
    })
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const categories = Array.from(
    new Set([
      ...themes.map((t) => (t.category?.slug ?? "")).filter(Boolean),
      ...CURATED_THEME_CATEGORIES.map((c) => c.slug),
    ])
  ).sort();

  const featuredCreatorsMap = new Map<string, { slug: string; name: string; totalSales: number }>();
  for (const t of themes) {
    if (t.store.featured && !featuredCreatorsMap.has(t.store.slug)) {
      featuredCreatorsMap.set(t.store.slug, {
        slug: t.store.slug,
        name: t.store.name,
        totalSales: t.store.total_sales,
      });
    }
  }

  let filtered = themes;
  if (category !== "all") {
    filtered = filtered.filter((t) => (t.category?.slug ?? "") === category);
  }
  if (search) {
    filtered = filtered.filter((t) => {
      return (
        t.name.toLowerCase().includes(search) ||
        t.store.name.toLowerCase().includes(search) ||
        (t.category?.name ?? "").toLowerCase().includes(search)
      );
    });
  }

  if (tab === "free") {
    filtered = filtered.filter((t) => t.base_price <= 0);
  } else if (tab === "recommended") {
    if (userId) {
      const { data: activityRows } = await supabaseAdmin
        .from("user_theme_activity")
        .select("action, category_slug, animation_type, creator_id, price")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

      const activity = (activityRows ?? []) as ThemeActivityRecord[];
      filtered = getRecommendedThemes(filtered, activity);
    } else {
      filtered = [...filtered].sort((a, b) => b.unlock_count - a.unlock_count);
    }
  } else {
    filtered = [...filtered].sort((a, b) => b.unlock_count - a.unlock_count);
  }

  // When browsing the Stores tab, also fetch all creator stores directly
  let creatorStores: CreatorStoreRow[] = [];
  if (tab === "stores") {
    const { data: storeRows } = await supabaseAdmin
      .from("creator_stores")
      .select("user_id, slug, store_name, featured, category, avatar_url, banner_url")
      .eq("is_active", true)
      .not("slug", "is", null)
      .not("store_name", "is", null)
      .order("featured", { ascending: false })
      .limit(200);

    const rawStores = ((storeRows ?? []) as CreatorStoreRow[]).filter(
      (s) => Boolean(s.slug) && Boolean(s.store_name) && !blockedUserIds.has((s as { user_id?: string }).user_id ?? "")
    );

    // Fetch public themes once: get slug + config for count + preview
    const { data: themeRows2 } = await supabaseAdmin
      .from("themes")
      .select("config, store:creator_stores!inner(slug)")
      .eq("is_public", true)
      .or("is_market_active.eq.true,is_market_active.is.null")
      .order("unlock_count", { ascending: false });

    const countMap = new Map<string, number>();
    const previewMap = new Map<string, Record<string, unknown>>();
    for (const row of themeRows2 ?? []) {
      const storeSlug = Array.isArray(row.store)
        ? (row.store[0] as { slug: string } | null)?.slug
        : (row.store as { slug: string } | null)?.slug;
      if (!storeSlug) continue;
      countMap.set(storeSlug, (countMap.get(storeSlug) ?? 0) + 1);
      if (!previewMap.has(storeSlug) && row.config) {
        previewMap.set(storeSlug, row.config as Record<string, unknown>);
      }
    }

    creatorStores = rawStores.map((s) => ({
      ...s,
      theme_count: countMap.get(s.slug) ?? 0,
      preview_theme_config: previewMap.get(s.slug) ?? null,
    }));
  }

  const response = NextResponse.json({
    themes: filtered,
    categories,
    featuredCreators: Array.from(featuredCreatorsMap.values()).slice(0, 10),
    creatorStores,
  });

  // Cache anonymous requests at CDN; never cache personalized (user-specific) responses
  if (!userId) {
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=60"
    );
  } else {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}