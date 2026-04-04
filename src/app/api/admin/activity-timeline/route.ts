import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"
import { requireRole } from "@/lib/auth/requireRole"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, "view_admin")

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")

    if (!userId) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("admin_actions")
      .select("id, action, severity, metadata, created_at")
      .eq("target_user", userId)
      .order("created_at", { ascending: false })
      .limit(15)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 })
    }

    return NextResponse.json({ timeline: data ?? [] })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
