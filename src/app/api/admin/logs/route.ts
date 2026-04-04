import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: rows } = await supabaseAdmin
      .from("admin_actions")
      .select("id, admin_id, action, target_user, metadata, severity, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    const logs = rows ?? [];

    // Batch-fetch profiles
    const ids = [...new Set(logs.flatMap((r) => [r.admin_id, r.target_user].filter(Boolean)))];
    let profileMap: Record<string, { handle: string | null; display_name: string | null }> = {};

    if (ids.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", ids);
      for (const p of profiles ?? []) {
        profileMap[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
    }

    return NextResponse.json({ logs, profileMap });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
