import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAutoAdminTicket } from "@/lib/adminAutoTicket";

// ── ADMIN RISK SCORE ENGINE ──
// Calculates risk score for an admin based on behavior patterns.
// Used by: auto-flag system, owner alerts, performance panels.

type RiskBreakdown = {
  score: number; // 0–100
  level: "low" | "medium" | "high" | "critical";
  factors: { label: string; points: number }[];
};

/**
 * Calculate an admin's risk score from recent activity.
 * Score 0–100: 0–25 low, 26–50 medium, 51–75 high, 76–100 critical.
 */
export async function calculateAdminRisk(userId: string): Promise<RiskBreakdown> {
  const factors: { label: string; points: number }[] = [];

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Factor 1: Restrictions issued in last hour (rapid-fire = bad)
  const { count: restrictionsHour } = await supabaseAdmin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userId)
    .in("action", ["restrict_user", "admin_restricted", "suspend_user"])
    .gte("created_at", oneHourAgo);

  const rHour = restrictionsHour ?? 0;
  if (rHour >= 10) factors.push({ label: `${rHour} restrictions in 1 hour`, points: 30 });
  else if (rHour >= 5) factors.push({ label: `${rHour} restrictions in 1 hour`, points: 15 });
  else if (rHour >= 3) factors.push({ label: `${rHour} restrictions in 1 hour`, points: 5 });

  // Factor 2: Overrides in last 24h
  const { count: overridesDay } = await supabaseAdmin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userId)
    .ilike("action", "%override%")
    .gte("created_at", oneDayAgo);

  const oDay = overridesDay ?? 0;
  if (oDay >= 5) factors.push({ label: `${oDay} overrides in 24h`, points: 25 });
  else if (oDay >= 3) factors.push({ label: `${oDay} overrides in 24h`, points: 10 });

  // Factor 3: Total actions in last hour (hyperactivity)
  const { count: actionsHour } = await supabaseAdmin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userId)
    .gte("created_at", oneHourAgo);

  const aHour = actionsHour ?? 0;
  if (aHour >= 50) factors.push({ label: `${aHour} actions in 1 hour (hyperactive)`, points: 20 });
  else if (aHour >= 30) factors.push({ label: `${aHour} actions in 1 hour`, points: 10 });

  // Factor 4: Open discipline tickets against this admin
  const { data: adminRow } = await supabaseAdmin
    .from("admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (adminRow) {
    const { count: openTickets } = await supabaseAdmin
      .from("admin_tickets")
      .select("id", { count: "exact", head: true })
      .eq("to_admin_id", adminRow.id)
      .in("status", ["open", "acknowledged"]);

    const oTickets = openTickets ?? 0;
    if (oTickets >= 3) factors.push({ label: `${oTickets} unresolved tickets`, points: 15 });
    else if (oTickets >= 1) factors.push({ label: `${oTickets} unresolved ticket(s)`, points: 5 });

    // Factor 5: Warnings this week
    const { count: warningsWeek } = await supabaseAdmin
      .from("admin_tickets")
      .select("id", { count: "exact", head: true })
      .eq("to_admin_id", adminRow.id)
      .in("type", ["warning", "policy_violation"])
      .gte("created_at", oneWeekAgo);

    const wWeek = warningsWeek ?? 0;
    if (wWeek >= 3) factors.push({ label: `${wWeek} warnings/violations this week`, points: 20 });
    else if (wWeek >= 1) factors.push({ label: `${wWeek} warning(s) this week`, points: 5 });
  }

  // Factor 6: Critical severity actions in last 24h
  const { count: criticalDay } = await supabaseAdmin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userId)
    .eq("severity", "critical")
    .gte("created_at", oneDayAgo);

  const cDay = criticalDay ?? 0;
  if (cDay >= 5) factors.push({ label: `${cDay} critical actions in 24h`, points: 15 });
  else if (cDay >= 2) factors.push({ label: `${cDay} critical actions in 24h`, points: 5 });

  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  const level = score >= 76 ? "critical" : score >= 51 ? "high" : score >= 26 ? "medium" : "low";

  return { score, level, factors };
}

/**
 * Calculate, persist, and escalate admin risk in one call.
 * Use after any significant admin action.
 */
export async function evaluateAndPersistAdminRisk(userId: string): Promise<RiskBreakdown> {
  const risk = await calculateAdminRisk(userId);

  // Persist to profile
  await supabaseAdmin
    .from("profiles")
    .update({
      admin_risk_score: risk.score,
      admin_risk_level: risk.level,
    })
    .eq("user_id", userId);

  // Auto-escalate: high/critical → log anomaly + alert
  if (risk.level === "high" || risk.level === "critical") {
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: null,
      action: "admin_risk_escalation",
      target_user: userId,
      severity: "critical",
      metadata: {
        risk_score: risk.score,
        risk_level: risk.level,
        factors: risk.factors,
        source: "system",
      },
    });

    await supabaseAdmin.from("fraud_anomalies").insert({
      user_id: userId,
      type: "admin_risk_high",
      score: risk.score,
      decision: "restrict",
      reason: `Admin risk ${risk.level}: ${risk.factors.map((f) => f.label).join(", ")}`,
      flags: ["admin_risk_high", ...risk.factors.map((f) => f.label)],
      context: { score: risk.score, level: risk.level, factors: risk.factors },
    });
  }

  // Also run anomaly checks (tickets, alerts)
  await checkAdminAnomalies(userId);

  return risk;
}

// ── SYSTEM ACTION LOGGER ──
// Logs system-generated actions (auto-restrictions, AI warnings, etc.)

type SystemLogParams = {
  adminUserId: string;
  action: string;
  targetUser?: string;
  severity?: "info" | "warning" | "critical";
  reason?: string;
  metadata?: Record<string, unknown>;
};

export async function logSystemAction({
  adminUserId,
  action,
  targetUser,
  severity = "info",
  reason,
  metadata = {},
}: SystemLogParams) {
  await supabaseAdmin.from("admin_actions").insert({
    admin_id: adminUserId,
    action: `system_${action}`,
    target_user: targetUser ?? null,
    severity,
    reason: reason ?? null,
    metadata: { ...metadata, source: "system" },
  }).then(() => {}, () => {});
}

// ── OWNER ALERT — ANOMALY DETECTION ──
// Check an admin's recent behavior and auto-create alerts for the owner.
// Call this after significant admin actions.

export async function checkAdminAnomalies(userId: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Check: too many restrictions in 5 minutes
  const { count: rapid } = await supabaseAdmin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userId)
    .in("action", ["restrict_user", "admin_restricted", "suspend_user"])
    .gte("created_at", fiveMinAgo);

  if ((rapid ?? 0) >= 5) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    await createAutoAdminTicket({
      targetUserId: userId,
      type: "warning",
      message: `⚠️ Unusual restriction behavior: ${profile?.display_name ?? "Admin"} issued ${rapid} restrictions in the last 5 minutes.`,
    });
    return; // one alert at a time
  }

  // Check: hyperactivity (50+ actions in 1 hour)
  const { count: hourly } = await supabaseAdmin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userId)
    .gte("created_at", oneHourAgo);

  if ((hourly ?? 0) >= 50) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    await createAutoAdminTicket({
      targetUserId: userId,
      type: "performance_review",
      message: `📊 High activity alert: ${profile?.display_name ?? "Admin"} performed ${hourly} actions in the last hour. Review for automation or unusual patterns.`,
    });
    return;
  }

  // Check: multiple override actions in 1 hour
  const { count: overrides } = await supabaseAdmin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userId)
    .ilike("action", "%override%")
    .gte("created_at", oneHourAgo);

  if ((overrides ?? 0) >= 3) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    await createAutoAdminTicket({
      targetUserId: userId,
      type: "escalation",
      message: `🔓 Override pattern detected: ${profile?.display_name ?? "Admin"} used ${overrides} overrides in the last hour.`,
    });
  }
}
