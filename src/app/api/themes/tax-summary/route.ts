import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/themes/tax-summary?year=2026
 * Returns the authenticated creator's earnings + payout totals for a given year.
 * Also upserts yearly_tax_summaries so the data is always current.
 */
export async function GET(req: NextRequest) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const rawYear = req.nextUrl.searchParams.get("year");
  const year = rawYear ? parseInt(rawYear, 10) : new Date().getFullYear();

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  // Calculate from source of truth — always DB, never cached values
  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd   = `${year + 1}-01-01T00:00:00.000Z`;

  const [{ data: sales }, { data: payoutRows }] = await Promise.all([
    supabaseAdmin
      .from("theme_sales")
      .select("creator_earnings")
      .eq("seller_id", userId)
      .in("status", ["approved", "paid"])
      .gte("created_at", yearStart)
      .lt("created_at", yearEnd),

    supabaseAdmin
      .from("payout_requests")
      .select("amount")
      .eq("user_id", userId)
      .eq("status", "paid")
      .gte("created_at", yearStart)
      .lt("created_at", yearEnd),
  ]);

  const totalEarnings = (sales ?? []).reduce((sum, s) => sum + Number(s.creator_earnings), 0);
  const totalPayouts  = (payoutRows ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

  const rounded = {
    total_earnings: Math.round(totalEarnings * 100) / 100,
    total_payouts:  Math.round(totalPayouts  * 100) / 100,
  };

  // Persist for admin / 1099 tooling
  await supabaseAdmin.from("yearly_tax_summaries").upsert(
    {
      user_id:        userId,
      tax_year:       year,
      total_earnings: rounded.total_earnings,
      total_payouts:  rounded.total_payouts,
      updated_at:     new Date().toISOString(),
    },
    { onConflict: "user_id,tax_year" }
  );

  return NextResponse.json({
    year,
    total_earnings: rounded.total_earnings,
    total_payouts:  rounded.total_payouts,
    note: "Earnings from approved/paid theme sales. Payouts issued via Stripe Connect.",
  });
}
