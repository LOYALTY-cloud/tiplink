import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"
import { requireRole } from "@/lib/auth/requireRole"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, ["owner"])

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("user_id")
    const date = searchParams.get("date")

    if (!userId || !date) {
      return NextResponse.json({ error: "Missing user_id or date" }, { status: 400 })
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("daily_event_snapshots")
      .select("*")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: "Failed to fetch snapshot" }, { status: 500 })
    }

    return NextResponse.json({ snapshot: data })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
