import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/cron/reset-daily-withdrawn?key=CRON_SECRET
 *
 * Resets the daily_withdrawn counter on all profiles at midnight.
 * Calls the existing reset_daily_withdrawn() RPC defined in the
 * 20260328_fraud_and_withdrawal_safety migration.
 *
 * Run daily at midnight UTC via Vercel cron.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin.rpc("reset_daily_withdrawn");

  if (error) {
    console.error("reset_daily_withdrawn error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
