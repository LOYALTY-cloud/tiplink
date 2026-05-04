import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  // ── Fetch sales where this user is the seller ─────────────────────────────────
  const { data: sales, error: salesErr } = await supabaseAdmin
    .from("theme_sales")
    .select("theme_id, amount, creator_earnings")
    .eq("seller_id", userId);

  if (salesErr) {
    console.error("analytics: sales fetch failed", salesErr);
    return NextResponse.json({ error: "Failed to load sales" }, { status: 500 });
  }

  // ── Fetch user's own themes (for unlock_count + names) ────────────────────────
  const { data: ownThemes, error: themesErr } = await supabaseAdmin
    .from("themes")
    .select("id, name, unlock_count, price, is_public")
    .eq("user_id", userId);

  if (themesErr) {
    console.error("analytics: themes fetch failed", themesErr);
    return NextResponse.json({ error: "Failed to load themes" }, { status: 500 });
  }

  // ── Aggregate totals ──────────────────────────────────────────────────────────
  const totalEarnings = sales?.reduce((s, r) => s + Number(r.creator_earnings), 0) ?? 0;
  const saleCount = sales?.length ?? 0;
  const totalUnlocks = ownThemes?.reduce((s, t) => s + (t.unlock_count ?? 0), 0) ?? 0;
  const avgPrice = saleCount > 0
    ? sales!.reduce((s, r) => s + Number(r.amount), 0) / saleCount
    : 0;

  // ── Per-theme breakdown ────────────────────────────────────────────────────────
  const themeMap = new Map<string, { id: string; name: string; earnings: number; sales: number }>();

  for (const theme of (ownThemes ?? [])) {
    themeMap.set(theme.id, { id: theme.id, name: theme.name, earnings: 0, sales: 0 });
  }

  for (const sale of (sales ?? [])) {
    const entry = themeMap.get(sale.theme_id);
    if (entry) {
      entry.earnings += Number(sale.creator_earnings);
      entry.sales += 1;
    }
  }

  // Sort by earnings descending, return top 5
  const topThemes = Array.from(themeMap.values())
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 5);

  return NextResponse.json({
    total_earnings: totalEarnings,
    sale_count: saleCount,
    unlock_count: totalUnlocks,
    avg_price: avgPrice,
    top_themes: topThemes,
  });
}
