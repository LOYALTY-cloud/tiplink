/**
 * GET /api/security-monitor/dashboard
 * Returns aggregate statistics for the security admin dashboard.
 * Super_admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (admin.role !== "super_admin" && admin.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [alertCounts, recentAlerts, blockedIps, pausedEndpoints, honeypotHits] = await Promise.all([
    supabaseAdmin
      .from("security_alerts")
      .select("severity, status")
      .gte("created_at", since24h),
    supabaseAdmin
      .from("security_alerts")
      .select("id, severity, type, summary, ip_masked, status, created_at")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("security_blocked_ips")
      .select("ip, reason, expires_at, created_at")
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("security_paused_endpoints")
      .select("route, reason, expires_at")
      .eq("paused", true)
      .gte("expires_at", new Date().toISOString()),
    supabaseAdmin
      .from("security_honeypots")
      .select("id")
      .gte("triggered_at", since24h),
  ]);

  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const row of alertCounts.data ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
  }

  return NextResponse.json({
    summary: {
      totalAlerts24h: alertCounts.data?.length ?? 0,
      openAlerts:     byStatus["open"] ?? 0,
      blockedIps:     blockedIps.data?.length ?? 0,
      pausedEndpoints: pausedEndpoints.data?.length ?? 0,
      honeypotHits24h: honeypotHits.data?.length ?? 0,
      bySeverity,
      byStatus,
    },
    recentAlerts: recentAlerts.data ?? [],
    blockedIps:   blockedIps.data ?? [],
    pausedEndpoints: pausedEndpoints.data ?? [],
  });
}
