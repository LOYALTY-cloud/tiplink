import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * GET /api/admin/status — check if the current admin is blocked/restricted.
 * Called on layout mount to enforce access control.
 */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("id, status, restricted_until, role")
      .eq("user_id", session.userId)
      .maybeSingle();

    // If no admins row exists yet, assume active (legacy/not-migrated)
    if (!admin) {
      return NextResponse.json({ status: "active", restricted: false });
    }

    const isRestricted =
      admin.status === "restricted" &&
      admin.restricted_until &&
      new Date(admin.restricted_until) > new Date();

    return NextResponse.json({
      status: admin.status,
      restricted: isRestricted,
      restricted_until: isRestricted ? admin.restricted_until : null,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
