import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ads: [] }, { status: 200 });
  }

  const nowTs = Date.now();

  const { data, error } = await supabaseAdmin
    .from("store_hero_ads")
    .select("id, title, subtitle, badge, cta_label, cta_href, cta_external, accent, motion, overlay, lighting, image_url, starts_at, ends_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    return NextResponse.json({ error: "Failed to load hero ads" }, { status: 500 });
  }

  const ads = (data ?? [])
    .filter((row) => {
      const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
      const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
      if (startsAt != null && startsAt > nowTs) return false;
      if (endsAt != null && endsAt < nowTs) return false;
      return true;
    })
    .slice(0, 12)
    .map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    badge: row.badge,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    ctaExternal: row.cta_external,
    accent: row.accent,
    motion: row.motion,
    overlay: row.overlay,
    lighting: row.lighting,
    imageUrl: row.image_url,
    }));

  return NextResponse.json({ ads });
}
