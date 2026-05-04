import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") || "pending") as "pending" | "approved" | "rejected";

    const { data, error } = await supabaseAdmin
      .from("elite_creator_applications")
      .select("id, user_id, created_at, name, email, creator_type, experience, work, portfolio, intent, status, reviewed_by, reviewed_at")
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin/creators/applications GET:", error);
      return NextResponse.json({ error: "Failed to load applications" }, { status: 500 });
    }

    const [pending, approved, rejected] = await Promise.all([
      supabaseAdmin.from("elite_creator_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("elite_creator_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin.from("elite_creator_applications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

    return NextResponse.json({
      applications: data ?? [],
      counts: {
        pending: pending.count ?? 0,
        approved: approved.count ?? 0,
        rejected: rejected.count ?? 0,
      },
    });
  } catch (e) {
    console.error("admin/creators/applications GET:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}