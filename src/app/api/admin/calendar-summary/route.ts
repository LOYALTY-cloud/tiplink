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

    if (!userId) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 })
    }

    // Primary: permanent snapshots
    const { data: snapshots, error: snapErr } = await supabaseAdmin
      .from("daily_event_snapshots")
      .select("date, summary, fraud_score, risk_level")
      .eq("user_id", userId)
      .order("date", { ascending: false })

    if (snapErr) {
      return NextResponse.json({ error: "Failed to fetch calendar data" }, { status: 500 })
    }

    // Build response from snapshots
    const days = (snapshots ?? []).map((s) => ({
      date: s.date,
      total: (s.summary as { total?: number })?.total ?? 0,
      refunds: (s.summary as { refunds?: number })?.refunds ?? 0,
      fraudScore: s.fraud_score ?? 0,
      level: s.risk_level ?? "low",
    }))

    // Fallback: also include today's live data (not yet snapshotted)
    const todayStr = new Date().toISOString().split("T")[0]
    const alreadyHasToday = days.some((d) => d.date === todayStr)

    if (!alreadyHasToday) {
      const { data: liveEvents } = await supabaseAdmin
        .from("admin_actions")
        .select("created_at, action")
        .eq("target_user", userId)
        .gte("created_at", `${todayStr}T00:00:00Z`)

      if (liveEvents && liveEvents.length > 0) {
        const refunds = liveEvents.filter((e) =>
          e.action?.toLowerCase().includes("refund")
        ).length
        const level = refunds >= 2 ? "high" : liveEvents.length >= 5 ? "medium" : "low"

        days.unshift({
          date: todayStr,
          total: liveEvents.length,
          refunds,
          fraudScore: 0,
          level,
        })
      }
    }

    return NextResponse.json({ days })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
