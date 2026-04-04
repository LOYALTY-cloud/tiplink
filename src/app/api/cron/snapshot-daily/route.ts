import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * Daily snapshot cron: archives all admin_actions from yesterday into
 * permanent daily_event_snapshots rows (one per user per day).
 *
 * Call via Vercel Cron or external scheduler:
 *   GET /api/cron/snapshot-daily?key=YOUR_CRON_SECRET
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().split("T")[0]

  // Fetch all admin actions for the target day
  const { data: events, error } = await supabaseAdmin
    .from("admin_actions")
    .select("*")
    .gte("created_at", `${dateStr}T00:00:00Z`)
    .lte("created_at", `${dateStr}T23:59:59Z`)

  if (error || !events) {
    return NextResponse.json({ error: "Failed to fetch actions", detail: error?.message }, { status: 500 })
  }

  if (events.length === 0) {
    return NextResponse.json({ ok: true, snapshotted: 0, date: dateStr })
  }

  // Group by target user
  const map: Record<string, typeof events> = {}

  for (const e of events) {
    const uid = e.target_user
    if (!uid) continue
    if (!map[uid]) map[uid] = []
    map[uid].push(e)
  }

  // Upsert snapshots per user
  let snapshotted = 0

  for (const [userId, userEvents] of Object.entries(map)) {
    const refunds = userEvents.filter((e) =>
      e.action?.toLowerCase().includes("refund")
    ).length

    const fraudScore = Math.min(100, refunds >= 2 ? 80 : userEvents.length * 5)
    const riskLevel = fraudScore >= 70 ? "high" : fraudScore >= 30 ? "medium" : "low"

    const { error: upsertErr } = await supabaseAdmin
      .from("daily_event_snapshots")
      .upsert(
        {
          user_id: userId,
          date: dateStr,
          events: userEvents,
          summary: { total: userEvents.length, refunds },
          fraud_score: fraudScore,
          risk_level: riskLevel,
        },
        { onConflict: "user_id,date" }
      )

    if (!upsertErr) snapshotted++
  }

  return NextResponse.json({ ok: true, snapshotted, date: dateStr })
}
