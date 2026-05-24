/**
 * Honeypot endpoint: /api/honeypot/[...path]
 *
 * Catches automated scanners probing fake admin/internal endpoints.
 * Logs every hit, emits a HONEYPOT_HIT security event, returns decoy data.
 * Real users NEVER hit this route — it matches paths that don't exist.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDecoyResponse } from "@/services/security-monitor/honeypots/decoy-api-responses";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handleHoneypot(req, params);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handleHoneypot(req, params);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handleHoneypot(req, params);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handleHoneypot(req, params);
}

async function handleHoneypot(req: NextRequest, paramsPromise: Promise<{ path: string[] }>) {
  const { path } = await paramsPromise;
  const fullPath = "/api/honeypot/" + (path ?? []).join("/");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "";

  // Log to security_honeypots (fire and forget)
  void supabaseAdmin
    .from("security_honeypots")
    .insert({ ip, path: fullPath, method: req.method, user_agent: ua.slice(0, 500) });

  // Also emit as a security event if the monitor is enabled
  if (process.env.AI_SECURITY_MONITOR === "true") {
    void supabaseAdmin
      .from("security_events")
      .insert({
        type: "HONEYPOT_HIT",
        ip,
        route: fullPath,
        metadata: { method: req.method, ua: ua.slice(0, 200) },
        occurred_at: new Date().toISOString(),
      });
  }

  // Return plausible-looking decoy data
  const { status, body } = getDecoyResponse(fullPath);
  return NextResponse.json(body, { status });
}
