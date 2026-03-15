import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()

  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  async function sumSince(date: Date) {
    const { data } = await supabase
      .from("transactions_ledger")
      .select("amount")
      .eq("user_id", user_id)
      .eq("type", "tip_received")
      .gte("created_at", date.toISOString())

    return data?.reduce((sum, row) => sum + Number((row as any).amount), 0) ?? 0
  }

  const today = await sumSince(startOfDay)
  const week = await sumSince(startOfWeek)
  const month = await sumSince(startOfMonth)

  return NextResponse.json({
    today,
    week,
    month,
  })
}
