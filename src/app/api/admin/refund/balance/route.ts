import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { getConnectedUsdBalance } from "@/lib/stripe/connectedBalance";

export const runtime = "nodejs";

/** GET /api/admin/refund/balance?user_id=... — Fetch creator Stripe balance */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "refund");

    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    const stripeBalance = profile?.stripe_account_id
      ? await getConnectedUsdBalance(profile.stripe_account_id)
      : { available: 0, pending: 0, total: 0 };

    return NextResponse.json({ stripe_balance: stripeBalance });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
