import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

const MIN_PAYOUT = 10; // USD

/**
 * GET /api/themes/balance
 * Returns { pending, available, min_payout, stripe_ready } for the authenticated creator.
 */
export async function GET(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  // Fetch all sales rows for this seller
  const { data: sales, error: salesErr } = await supabaseAdmin
    .from("theme_sales")
    .select("creator_earnings, reserved_amount, paid_out_amount, status")
    .eq("seller_id", userId);

  if (salesErr) {
    console.error("balance: sales fetch error", salesErr);
    return NextResponse.json({ error: "Failed to load balance" }, { status: 500 });
  }

  const pending   = (sales ?? []).filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + Number(s.creator_earnings), 0);
  const available = (sales ?? [])
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => {
      const gross = Number(s.creator_earnings ?? 0);
      const reserved = Number(s.reserved_amount ?? 0);
      const paidOut = Number(s.paid_out_amount ?? 0);
      return sum + Math.max(0, gross - reserved - paidOut);
    }, 0);

  // Check Stripe Connect readiness
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  const stripeReady = !!(profile?.stripe_account_id && profile?.stripe_payouts_enabled);

  // Check if user has a default payout card (external account on their Connect account)
  const { data: payoutCard } = await supabaseAdmin
    .from("payout_methods")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .eq("status", "active")
    .not("stripe_external_account_id", "is", null)
    .maybeSingle();

  const hasPayoutCard = !!payoutCard;

  return NextResponse.json({
    pending: Math.round(pending * 100) / 100,
    available: Math.round(available * 100) / 100,
    min_payout: MIN_PAYOUT,
    stripe_ready: stripeReady,
    has_payout_card: hasPayoutCard,
  });
}
