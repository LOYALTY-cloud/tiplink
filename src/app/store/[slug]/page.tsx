import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import StorefrontClient from "./StorefrontClient";

export const revalidate = 120; // 2 minutes

type Props = { params: Promise<{ slug: string }> };

type ThemeCategoryJoin = {
  name: string | null;
  slug: string | null;
};

function getThemeCategory(value: unknown): ThemeCategoryJoin | null {
  if (!value) return null;

  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;

  const category = candidate as Record<string, unknown>;
  return {
    name: typeof category.name === "string" ? category.name : null,
    slug: typeof category.slug === "string" ? category.slug : null,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const { data: store } = await supabaseAdmin
    .from("creator_stores")
    .select("store_name, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!store) return { title: "Store not found — TipLink" };

  return {
    title: `${store.store_name} — TipLink Creator Store`,
    description: store.description ?? `Browse themes by ${store.store_name} on TipLink.`,
  };
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params;

  const { data: store } = await supabaseAdmin
    .from("creator_stores")
    .select("id, store_name, slug, description, user_id, total_sales, featured, avatar_url, banner_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!store) notFound();

  const { data: creatorProfile } = await supabaseAdmin
    .from("profiles")
    .select("display_name, avatar_url, handle, account_status, store_disabled")
    .eq("user_id", store.user_id)
    .maybeSingle();

  // Hide store if creator is restricted, suspended, closed, or admin-disabled
  if (
    (creatorProfile?.account_status && creatorProfile.account_status !== "active") ||
    creatorProfile?.store_disabled === true
  ) {
    notFound();
  }

  const { data: themes } = await supabaseAdmin
    .from("themes")
    .select("id, name, price, base_price, upgrade_price, unlock_count, created_at, config, category_id, is_verified, category:theme_categories(name, slug)")
    .eq("user_id", store.user_id)
    .eq("is_public", true)
    .or("is_market_active.eq.true,is_market_active.is.null")
    .order("created_at", { ascending: false });

  return (
    <StorefrontClient
      store={{
        id:          store.id,
        store_name:  store.store_name ?? "Untitled Store",
        slug:        store.slug ?? "",
        description: store.description ?? null,
        total_sales: store.total_sales ?? 0,
        featured: store.featured === true,
        avatar_url: typeof store.avatar_url === "string" ? store.avatar_url : null,
        banner_url: typeof store.banner_url === "string" ? store.banner_url : null,
        creator: {
          display_name: creatorProfile?.display_name ?? store.store_name ?? "Creator",
          handle: creatorProfile?.handle ?? null,
          avatar_url: creatorProfile?.avatar_url ?? null,
        },
      }}
      themes={(themes ?? []).map((t) => ({
        id:           t.id,
        name:         t.name,
        price:        Number(t.base_price ?? t.price ?? 0),
        base_price:   Number(t.base_price ?? t.price ?? 0),
        upgrade_price: typeof t.upgrade_price === "number" ? t.upgrade_price : null,
        unlock_count: t.unlock_count ?? 0,
        created_at:   typeof t.created_at === "string" ? t.created_at : null,
        config:       t.config as Record<string, unknown>,
        category_id: typeof t.category_id === "string" ? t.category_id : null,
        is_verified: t.is_verified === true,
        category: getThemeCategory(t.category),
      }))}
    />
  );
}
