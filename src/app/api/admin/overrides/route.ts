import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET /api/admin/overrides
 *
 * Returns paginated override history with optional filters.
 * Query params:
 *   limit   – max rows (default 50, max 200)
 *   offset  – pagination offset
 *   type    – filter by override_type
 *   admin   – filter by admin_id
 *   user    – filter by target_user
 */
export async function GET(req: NextRequest) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  requireRole(session.role, "risk_eval");

  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get("limit") || 50), 200);
  const offset = Number(params.get("offset") || 0);
  const typeFilter = params.get("type");
  const adminFilter = params.get("admin");
  const userFilter = params.get("user");

  let query = supabaseAdmin
    .from("admin_overrides")
    .select("id, admin_id, target_user, override_type, previous_value, new_value, reason, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (typeFilter) query = query.eq("override_type", typeFilter);
  if (adminFilter) query = query.eq("admin_id", adminFilter);
  if (userFilter) query = query.eq("target_user", userFilter);

  const { data, count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve admin + target display names in bulk
  const adminIds = [...new Set((data ?? []).map((d) => d.admin_id).filter(Boolean))];
  const userIds = [...new Set((data ?? []).map((d) => d.target_user).filter(Boolean))];
  const allIds = [...new Set([...adminIds, ...userIds])];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, handle")
    .in("user_id", allIds.length > 0 ? allIds : ["__none__"]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, { display_name: p.display_name, handle: p.handle }])
  );

  const enriched = (data ?? []).map((row) => {
    const adminProfile = profileMap.get(row.admin_id);
    const targetProfile = profileMap.get(row.target_user);
    return {
      ...row,
      admin_name: adminProfile?.display_name || adminProfile?.handle || row.admin_id,
      target_name: targetProfile?.display_name || (targetProfile?.handle ? `@${targetProfile.handle}` : row.target_user),
    };
  });

  return NextResponse.json({ data: enriched, total: count ?? 0 });
}
