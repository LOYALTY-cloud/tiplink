import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;

  // Fetch all theme_sales for this seller, joined to theme name
  const { data: sales, error: salesErr } = await supabaseAdmin
    .from("theme_sales")
    .select("theme_id, creator_earnings, status, themes(name)")
    .eq("seller_id", userId);

  if (salesErr) {
    console.error("store-analytics: sales fetch failed", salesErr);
    return NextResponse.json({ error: "Failed to load sales" }, { status: 500 });
  }

  // Pending = status "pending"; available = status "approved" (not yet paid out)
  const pending = (sales ?? [])
    .filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + Number(s.creator_earnings), 0);

  const available = (sales ?? [])
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => sum + Number(s.creator_earnings), 0);

  // Per-theme breakdown
  const themeMap = new Map<string, { name: string; sold: number; earnings: number }>();
  for (const sale of sales ?? []) {
    const name = (sale.themes as { name: string } | null)?.name ?? "Untitled";
    const existing = themeMap.get(sale.theme_id);
    if (existing) {
      existing.sold += 1;
      existing.earnings += Number(sale.creator_earnings);
    } else {
      themeMap.set(sale.theme_id, { name, sold: 1, earnings: Number(sale.creator_earnings) });
    }
  }

  const byTheme = Array.from(themeMap.values()).sort((a, b) => b.earnings - a.earnings);

  return NextResponse.json({
    pending,
    available,
    total_sold: (sales ?? []).length,
    by_theme: byTheme,
  });
}
