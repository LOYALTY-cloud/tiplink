import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"
import { requireRole } from "@/lib/auth/requireRole"

export const runtime = "nodejs"

// GET — fetch unacknowledged alerts
export async function GET(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, "risk_eval")

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20), 50)

    const { data, error } = await supabaseAdmin
      .from("fraud_alerts")
      .select("id, user_id, alert_type, severity, message, metadata, created_at")
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 })
    }

    return NextResponse.json({ alerts: data ?? [] })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// POST — acknowledge an alert
export async function POST(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, "risk_eval")

    const { alertId } = await req.json()
    if (!alertId || typeof alertId !== "string") {
      return NextResponse.json({ error: "Missing alertId" }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from("fraud_alerts")
      .update({
        acknowledged: true,
        acknowledged_by: session.userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", alertId)

    if (error) {
      return NextResponse.json({ error: "Failed to acknowledge" }, { status: 500 })
    }

    return NextResponse.json({ acknowledged: true })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
