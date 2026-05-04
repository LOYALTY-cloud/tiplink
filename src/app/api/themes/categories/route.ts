import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { CURATED_THEME_CATEGORIES } from "@/lib/themeCategories";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;

  const { data, error } = await supabaseAdmin
    .from("theme_categories")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    console.error("themes/categories:", error);
    return NextResponse.json({
      categories: CURATED_THEME_CATEGORIES.map((c) => ({
        id: c.slug,
        name: c.name,
        slug: c.slug,
      })),
      fallback: true,
    });
  }

  return NextResponse.json({ categories: data ?? [] });
}