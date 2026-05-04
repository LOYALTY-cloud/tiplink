import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await params;

    const [walletRes, tipsRes, disputeRes] = await Promise.all([
      supabaseAdmin
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id, tip_amount, refunded_amount, refund_status, status, created_at")
        .eq("creator_user_id", userId)
        .neq("refund_status", "none")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("tip_intents")
        .select("receipt_id", { count: "exact", head: true })
        .eq("creator_user_id", userId)
        .eq("status", "disputed"),
    ]);

    return NextResponse.json({
      wallet: walletRes.data ?? { balance: 0 },
      tips: tipsRes.data ?? [],
      disputeCount: disputeRes.count ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
