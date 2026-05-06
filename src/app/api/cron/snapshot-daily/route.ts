import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * Daily wallet snapshot cron.
 *
 * For every user with a wallet, captures current balance and lifetime
 * tip_received total into the `daily_snapshots` table. Uses a single
 * aggregation query + bulk upsert — no per-user loops.
 *
 * Schedule: 0 0 * * * (midnight UTC)
 * GET /api/cron/snapshot-daily?key=CRON_SECRET
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")
  if (req.headers.get("x-vercel-cron") !== "1" && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date().toISOString().split("T")[0] // UTC date

  // Single query: join wallets with aggregated earnings from ledger
  const { data: rows, error: queryErr } = await supabaseAdmin.rpc(
    "snapshot_wallet_balances"
  )

  if (queryErr || !rows) {
    // Fallback: manual two-step if RPC doesn't exist yet
    if (queryErr?.message?.includes("function") && queryErr?.message?.includes("does not exist")) {
      return await fallbackSnapshot(today)
    }
    return NextResponse.json(
      { error: "Failed to query wallets" },
      { status: 500 }
    )
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, snapshotted: 0, date: today })
  }

  // Bulk upsert (Supabase supports array upsert)
  const snapshots = rows.map((r: { user_id: string; balance: number; total_earned: number }) => ({
    user_id: r.user_id,
    balance: r.balance,
    total_earned: r.total_earned,
    date: today,
  }))

  const { error: upsertErr, count } = await supabaseAdmin
    .from("daily_snapshots")
    .upsert(snapshots, { onConflict: "user_id,date", count: "exact" })

  if (upsertErr) {
    return NextResponse.json(
      { error: "Failed to upsert snapshots" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, snapshotted: count ?? rows.length, date: today })
}

/** Fallback if the RPC hasn't been deployed yet. Uses two queries. */
async function fallbackSnapshot(today: string) {
  // 1. Fetch all wallets
  const { data: wallets, error: wErr } = await supabaseAdmin
    .from("wallets")
    .select("user_id, balance")

  if (wErr || !wallets) {
    return NextResponse.json(
      { error: "Failed to fetch wallets" },
      { status: 500 }
    )
  }

  if (wallets.length === 0) {
    return NextResponse.json({ ok: true, snapshotted: 0, date: today })
  }

  // 2. Get total earned per user (sum of tip_received)
  const { data: earnings, error: eErr } = await supabaseAdmin
    .from("transactions_ledger")
    .select("user_id, amount")
    .eq("type", "tip_received")

  // Build a map of user_id -> total_earned
  const earnedMap: Record<string, number> = {}
  if (!eErr && earnings) {
    for (const e of earnings) {
      earnedMap[e.user_id] = (earnedMap[e.user_id] || 0) + Number(e.amount)
    }
  }

  const snapshots = wallets.map((w) => ({
    user_id: w.user_id,
    balance: Number(w.balance),
    total_earned: earnedMap[w.user_id] || 0,
    date: today,
  }))

  const { error: upsertErr, count } = await supabaseAdmin
    .from("daily_snapshots")
    .upsert(snapshots, { onConflict: "user_id,date", count: "exact" })

  if (upsertErr) {
    return NextResponse.json(
      { error: "Failed to upsert snapshots" },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    snapshotted: count ?? wallets.length,
    date: today,
    mode: "fallback",
  })
}
