import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { getConnectedUsdBalance } from "@/lib/stripe/connectedBalance";

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

    const [profileRes, txRes, tipRes, supportRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("handle, display_name, email, account_status, role, created_at, is_flagged, stripe_account_id").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("transactions_ledger").select("id, type, amount, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("tip_intents").select("receipt_id").eq("creator_user_id", uid),
      supabaseAdmin.from("support_sessions").select("id, status, last_message, assigned_admin_name, closed_by, closed_at, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
    ]);

    const profile = profileRes.data;
    const stripeBalance = profile?.stripe_account_id
      ? await getConnectedUsdBalance(profile.stripe_account_id)
      : { available: 0, pending: 0, total: 0 };

    return NextResponse.json({
      profile: profile ? {
        handle: profile.handle,
        display_name: profile.display_name,
        email: profile.email,
        account_status: profile.account_status,
        role: profile.role,
        created_at: profile.created_at,
        is_flagged: profile.is_flagged,
      } : null,
      stripe_balance: stripeBalance,
      transactions: txRes.data || [],
      tipCount: tipRes.data?.length || 0,
      supportSessions: supportRes.data || [],
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
