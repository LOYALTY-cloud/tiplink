import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** GET — load user card data for a support session */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { sessionId } = await params;

    // Get session to find user_id
    const { data: session } = await supabaseAdmin
      .from("support_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session?.user_id) {
      return NextResponse.json({ error: "Session or user not found" }, { status: 404 });
    }

    const uid = session.user_id;

    const [profileRes, walletRes, txRes, tipRes, supportRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("handle, display_name, email, account_status, role, created_at, is_flagged").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("wallets").select("balance").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("transactions").select("id, type, amount, status, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("tip_intents").select("receipt_id").eq("recipient_user_id", uid),
      supabaseAdmin.from("support_sessions").select("id, status, last_message, assigned_admin_name, closed_by, closed_at, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
    ]);

    return NextResponse.json({
      profile: profileRes.data || null,
      wallet: walletRes.data || null,
      transactions: txRes.data || [],
      tipCount: tipRes.data?.length || 0,
      supportSessions: supportRes.data || [],
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
