import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/themes/payouts
 * Returns the authenticated user's payout history, most recent first.
 */
export async function GET(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const { data: payouts, error } = await supabaseAdmin
    .from("payout_requests")
    .select(
      "id, amount, status, stripe_transfer_id, receipt_url, tax_year, total_earnings_snapshot, requested_at, created_at, processed_at, paid_at, failure_reason"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("payouts/list: error", error);
    return NextResponse.json({ error: "Failed to load payout history" }, { status: 500 });
  }

  return NextResponse.json({ payouts: payouts ?? [] });
}
