/**
 * Cron: /api/security-monitor/run
 * Runs the full security monitor pipeline.
 * Protected by x-vercel-cron header or CRON_SECRET query param.
 * Schedule: every 10 minutes (see vercel.json)
 */

import { NextRequest, NextResponse } from "next/server";
import { runSecurityMonitor } from "@/services/security-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = req.nextUrl.searchParams.get("key");

  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSecurityMonitor();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[security-monitor/run] unexpected error:", err);
    return NextResponse.json({ error: "Monitor run failed" }, { status: 500 });
  }
}
