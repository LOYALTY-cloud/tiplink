import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/cron/cleanup-rate-limits
 * Deletes expired rate limit entries. Run daily via Vercel cron.
 */
export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = new URL(req.url).searchParams.get("key");
  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin.rpc("cleanup_rate_limits");

  if (error) {
    console.error("cleanup_rate_limits error:", error.message);
    return NextResponse.json({ error: "Failed to cleanup rate limits." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
