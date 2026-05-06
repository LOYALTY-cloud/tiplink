import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rankStores } from "@/lib/storeRanking";
import { CURATED_THEME_CATEGORIES } from "@/lib/themeCategories";

export const runtime = "nodejs";
export const revalidate = 60;

/**
 * GET /api/store/marketplace
 * Public marketplace feed with ranking, featured stores, and categories.
 */
export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ featured: [], stores: [], categories: ["general"] }, { status: 200 });
  }

  const { data, error } = await supabaseAdmin
    .from("creator_stores")
    .select("id, store_name, slug, description, category, total_sales, total_revenue, followers, featured, avatar_url, banner_url, created_at")
    .eq("is_active", true)
    .not("slug", "is", null)
    .not("store_name", "is", null);

  let rows = data;

  if (error) {
    if ((error.message ?? "").includes("Could not find the table 'public.creator_stores'")) {
      return NextResponse.json({ featured: [], stores: [], categories: ["general"] });
    }

    // Backward-compatible fallback when discovery migration hasn't been applied yet.
    if ((error.message ?? "").includes("column") && (error.message ?? "").includes("creator_stores")) {
      const fallback = await supabaseAdmin
        .from("creator_stores")
        .select("id, store_name, slug, description, avatar_url, banner_url, created_at")
        .eq("is_active", true)
        .not("slug", "is", null)
        .not("store_name", "is", null);

      if (fallback.error) {
        console.error("store/marketplace fallback:", fallback.error);
        return NextResponse.json({ error: "Failed to load marketplace" }, { status: 500 });
      }

      rows = (fallback.data ?? []).map((s) => ({
        ...s,
        category: "general",
        total_sales: 0,
        total_revenue: 0,
        followers: 0,
        featured: false,
        avatar_url: null,
        banner_url: null,
      }));
    } else {
      console.error("store/marketplace:", error);
      return NextResponse.json({ error: "Failed to load marketplace" }, { status: 500 });
    }
  }

  const ranked = rankStores(rows ?? []);
  const featured = ranked.filter((s) => s.featured).slice(0, 5);

  const categories = Array.from(
    new Set([
      ...(ranked ?? []).map((s) => (s.category ?? "general").toLowerCase()),
      ...CURATED_THEME_CATEGORIES.map((c) => c.slug),
    ])
  ).sort();

  return NextResponse.json({
    featured,
    stores: ranked,
    categories,
  });
}
