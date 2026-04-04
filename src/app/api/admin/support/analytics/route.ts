import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const thirtyDaysAgo = daysAgo(30);
    const today = todayStart();

    // Run all queries in parallel
    const [
      totalRes,
      activeRes,
      waitingRes,
      todayRes,
      closedByRes,
      durationRes,
      sessionsRaw,
      messagesRaw,
      aiSessionsRes,
      humanSessionsRes,
      aiConvertedRes,
    ] = await Promise.all([
      // Total sessions
      supabaseAdmin
        .from("support_sessions")
        .select("*", { count: "exact", head: true }),

      // Active now
      supabaseAdmin
        .from("support_sessions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),

      // Waiting now
      supabaseAdmin
        .from("support_sessions")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting"),

      // Sessions today
      supabaseAdmin
        .from("support_sessions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today),

      // Close reasons (last 30 days)
      supabaseAdmin
        .from("support_sessions")
        .select("closed_by")
        .eq("status", "closed")
        .gte("created_at", thirtyDaysAgo),

      // Duration metrics from admin_actions
      supabaseAdmin
        .from("admin_actions")
        .select("admin_id, metadata")
        .eq("action", "support_session_closed")
        .gte("created_at", thirtyDaysAgo),

      // Sessions per day (last 30 days) for trend chart
      supabaseAdmin
        .from("support_sessions")
        .select("created_at")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true }),

      // Response time: first user + admin messages per session (last 30 days)
      supabaseAdmin
        .from("support_messages")
        .select("session_id, sender_type, created_at")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true }),

      // AI-handled sessions (mode stayed ai through close)
      supabaseAdmin
        .from("support_sessions")
        .select("*", { count: "exact", head: true })
        .eq("mode", "ai")
        .gte("created_at", thirtyDaysAgo),

      // Human-handled sessions
      supabaseAdmin
        .from("support_sessions")
        .select("*", { count: "exact", head: true })
        .eq("mode", "human")
        .gte("created_at", thirtyDaysAgo),

      // AI → human conversions (sessions that started AI and got assigned an admin)
      supabaseAdmin
        .from("support_sessions")
        .select("*", { count: "exact", head: true })
        .eq("mode", "human")
        .not("assigned_admin_id", "is", null)
        .gte("created_at", thirtyDaysAgo),
    ]);

    // --- Process close reasons ---
    const closeReasons: Record<string, number> = { admin: 0, user: 0, system: 0 };
    for (const s of closedByRes.data || []) {
      const by = s.closed_by || "unknown";
      closeReasons[by] = (closeReasons[by] || 0) + 1;
    }

    // --- Process duration metrics ---
    const durations: { admin_id: string; duration_min: number }[] = [];
    for (const a of durationRes.data || []) {
      const meta = a.metadata as { duration_min?: number; duration_ms?: number } | null;
      if (meta?.duration_min != null) {
        durations.push({ admin_id: a.admin_id, duration_min: meta.duration_min });
      }
    }
    const avgResolution =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d.duration_min, 0) / durations.length
        : 0;

    // --- Admin leaderboard ---
    const adminMap = new Map<string, { sessions: number; totalMin: number }>();
    for (const d of durations) {
      const entry = adminMap.get(d.admin_id) || { sessions: 0, totalMin: 0 };
      entry.sessions += 1;
      entry.totalMin += d.duration_min;
      adminMap.set(d.admin_id, entry);
    }

    // Fetch admin names for leaderboard
    const adminIds = Array.from(adminMap.keys()).filter(
      (id) => id !== "00000000-0000-0000-0000-000000000000"
    );
    let adminNames: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, handle")
        .in("user_id", adminIds);
      for (const p of profiles || []) {
        adminNames[p.user_id] = p.display_name || p.handle || p.user_id.slice(0, 8);
      }
    }

    const topAgents = Array.from(adminMap.entries())
      .filter(([id]) => id !== "00000000-0000-0000-0000-000000000000")
      .map(([id, stats]) => ({
        admin_id: id,
        name: adminNames[id] || id.slice(0, 8),
        sessions: stats.sessions,
        avgMin: stats.sessions > 0 ? Math.round(stats.totalMin / stats.sessions) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    // --- Sessions per day trend ---
    const dayMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of sessionsRaw.data || []) {
      const day = s.created_at.slice(0, 10);
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    const trend = Array.from(dayMap.entries()).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count,
    }));

    // --- Avg response time (first admin reply - first user message) ---
    const sessionMessages = new Map<string, { firstUser?: number; firstAdmin?: number }>();
    for (const m of messagesRaw.data || []) {
      const entry = sessionMessages.get(m.session_id) || {};
      const ts = new Date(m.created_at).getTime();
      if (m.sender_type === "user" && !entry.firstUser) {
        entry.firstUser = ts;
      } else if (m.sender_type === "admin" && !entry.firstAdmin) {
        entry.firstAdmin = ts;
      }
      sessionMessages.set(m.session_id, entry);
    }

    const responseTimes: number[] = [];
    for (const [, entry] of sessionMessages) {
      if (entry.firstUser && entry.firstAdmin && entry.firstAdmin > entry.firstUser) {
        responseTimes.push((entry.firstAdmin - entry.firstUser) / 1000);
      }
    }
    const avgResponse =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    return NextResponse.json({
      totalSessions: totalRes.count || 0,
      activeSessions: activeRes.count || 0,
      waitingSessions: waitingRes.count || 0,
      todaySessions: todayRes.count || 0,
      avgResolution: Number(avgResolution.toFixed(1)),
      avgResponse: Number(avgResponse.toFixed(1)),
      closeReasons,
      topAgents,
      trend,
      aiSessions: aiSessionsRes.count || 0,
      humanSessions: humanSessionsRes.count || 0,
      aiToHumanConversions: aiConvertedRes.count || 0,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
