import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch active/waiting support sessions
    let result = await supabaseAdmin
      .from("support_sessions")
      .select("*")
      .in("status", ["waiting", "active"])
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    if (result.error) {
      // priority column may not exist yet — query without it
      result = await supabaseAdmin
        .from("support_sessions")
        .select("*")
        .in("status", ["waiting", "active"])
        .order("created_at", { ascending: true });
    }

    // Resolve user handles from profiles
    const sessions = result.data || [];
    const userIds = [...new Set(sessions.map((s: any) => s.user_id).filter(Boolean))];
    let handleMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle")
        .in("user_id", userIds);
      if (profiles) {
        for (const p of profiles) {
          if (p.handle) handleMap[p.user_id] = p.handle;
        }
      }
    }
    const sessionsWithHandles = sessions.map((s: any) => ({
      ...s,
      user_handle: s.user_id ? handleMap[s.user_id] || null : null,
    }));

    // Fetch admin presence
    const { data: admins } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, availability, role")
      .in("role", ["owner", "super_admin", "finance_admin", "support_admin"]);

    return NextResponse.json({
      sessions: sessionsWithHandles,
      admins: admins || [],
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
