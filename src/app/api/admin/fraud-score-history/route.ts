import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"
import { requireRole } from "@/lib/auth/requireRole"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, "risk_eval")

    const userId = req.nextUrl.searchParams.get("user_id")
    if (!userId) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("fraud_score_history")
      .select("id, score, level, patterns, source, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 })
    }

    return NextResponse.json({ history: data ?? [] })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
