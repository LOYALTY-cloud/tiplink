import { createAdminNotification } from "@/lib/adminNotifications";
import { logAdminActivity } from "@/lib/adminActivityLog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFinancialInsights } from "@/lib/ai/tools";

type AlertAction = {
  label: string;
  action: string;
};

type AiAlert = {
  title: string;
  message: string;
  priority: "high" | "critical";
  cause?: string;
  actions?: AlertAction[];
};

const DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const TRIGGER_COOLDOWN_MS = 5 * 60 * 1000;

async function wasRecentlySent(title: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("admin_notifications")
    .select("id")
    .eq("type", "ai_alert")
    .eq("title", title)
    .gte("created_at", since)
    .limit(1);

  if (error) {
    // Fail open to avoid silently dropping potentially important alerts.
    return false;
  }

  return (data ?? []).length > 0;
}

async function wasTriggerRecentlyRun(reason: string): Promise<boolean> {
  const since = new Date(Date.now() - TRIGGER_COOLDOWN_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("admin_activity_log")
    .select("id")
    .eq("action", "ai_alert_trigger")
    .eq("metadata->>reason", reason)
    .gte("created_at", since)
    .limit(1);

  if (error) {
    // Fail open if audit lookup fails so important alerts can still run.
    return false;
  }

  return (data ?? []).length > 0;
}

function buildAlertDetails(insights: any): AiAlert[] {
  const alerts: AiAlert[] = [];

  // 🚨 Failure rate alert
  if (insights.failureRate > 7) {
    alerts.push({
      title: "High Failure Rate",
      message: `Failure rate is ${insights.failureRate}% in the current window.`,
      priority: "critical",
      cause: "Payment provider errors increased in the last hour. Check API logs for failures.",
      actions: [
        { label: "Retry Failed Payments", action: "retry_failed" },
        { label: "View Transactions", action: "view_transactions" },
        { label: "Check Provider Status", action: "view_logs" },
      ],
    });
  }

  // 📉 Revenue drop alert
  if (insights.trends.processed < -30) {
    alerts.push({
      title: "Revenue Drop",
      message: `Payments are down ${insights.trends.processed}% vs prior period.`,
      priority: "high",
      cause: "Significant decline compared to previous period. May indicate user activity drop or payment processing issues.",
      actions: [
        { label: "View Financials", action: "view_financials" },
        { label: "View Transactions", action: "view_transactions" },
      ],
    });
  }

  // 📈 Withdrawal spike alert
  if (insights.trends.withdrawals > 50) {
    alerts.push({
      title: "Withdrawal Spike",
      message: `Withdrawals are up ${insights.trends.withdrawals}% vs prior period.`,
      priority: "high",
      cause: "High withdrawal activity detected. Monitor for unusual patterns or fraud.",
      actions: [
        { label: "Review Withdrawals", action: "view_withdrawals" },
        { label: "View Transactions", action: "view_transactions" },
      ],
    });
  }

  // 🔴 Multiple anomalies alert
  if (insights.anomalies.length >= 2) {
    alerts.push({
      title: "Multiple System Anomalies",
      message: insights.anomalies.join(" • "),
      priority: "critical",
      cause: `${insights.anomalies.length} system anomalies detected. Review detailed logs for investigation.`,
      actions: [
        { label: "View Logs", action: "view_logs" },
        { label: "View Financials", action: "view_financials" },
      ],
    });
  }

  return alerts;
}

export async function runAIAlerts(): Promise<number> {
  const insights = await getFinancialInsights("today");
  const alerts = buildAlertDetails(insights);

  let created = 0;
  for (const alert of alerts) {
    const exists = await wasRecentlySent(alert.title);
    if (exists) continue;

    await createAdminNotification({
      type: "ai_alert",
      title: alert.title,
      message: alert.message,
      priority: alert.priority,
      visibility: "role",
      roleTarget: ["owner", "super_admin"],
      requiresAction: true,
      status: "open",
      link: "/admin/owner-ai",
      metadata: {
        cause: alert.cause || "",
        actions: alert.actions || [],
      },
    });

    created += 1;
  }

  return created;
}

export async function triggerAIAlerts(reason: string): Promise<void> {
  try {
    const wasRecent = await wasTriggerRecentlyRun(reason);
    if (wasRecent) return;

    const created = await runAIAlerts();
    await logAdminActivity({
      type: "system",
      title: "AI alert trigger executed",
      description: `AI alert trigger ran for ${reason}`,
      action: "ai_alert_trigger",
      severity: created > 0 ? "warning" : "info",
      metadata: {
        reason,
        alerts_created: created,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ai-alerts] trigger failed (${reason}): ${message}`);
  }
}
