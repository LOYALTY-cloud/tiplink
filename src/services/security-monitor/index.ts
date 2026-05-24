/**
 * Security Monitor — Main Orchestrator
 *
 * Called by the cron endpoint (/api/security-monitor/run) every 10 minutes.
 * Pipeline: collect → rules → AI → actions → alerts → persist
 *
 * Design: self-contained. Errors in one stage never propagate to the next.
 */

import { securityConfig } from "./config/security-config";
import { THRESHOLDS } from "./config/thresholds";
import { createLogger } from "./utils/logger";

import { collectSupabaseEvents } from "./collectors/collect-supabase";
import { summariseAuthEvents } from "./collectors/collect-auth";
import { collectStripePayouts } from "./collectors/collect-stripe";

import { runAuthRules } from "./rules/auth-rules";
import { runStripeRules } from "./rules/stripe-rules";
import { runApiRules } from "./rules/api-rules";
import { runAdminRules } from "./rules/admin-rules";
import { runScrapingRules } from "./rules/scraping-rules";

import { classifySeverity } from "./ai/classify-severity";
import { summarizeAlert } from "./ai/summarize-alert";
import { generatePlaybook } from "./ai/remediation-playbook";

import { blockIp } from "./actions/block-ip";
import { tightenRateLimit } from "./actions/tighten-rate-limit";

import { sendEmailAlert } from "./alerts/send-email-alert";
import { sendAdminNotification } from "./alerts/send-admin-notification";
import { sendDiscordAlert } from "./alerts/send-discord-alert";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SecurityAlert, ActionResult } from "./types/security-event";

const log = createLogger("orchestrator");

export async function runSecurityMonitor(): Promise<{ alertsGenerated: number; actionsExecuted: number }> {
  if (!securityConfig.enabled) {
    log.info("AI_SECURITY_MONITOR is disabled — exiting");
    return { alertsGenerated: 0, actionsExecuted: 0 };
  }

  log.info(`Starting run (mode: ${securityConfig.mode})`);
  const startedAt = Date.now();

  // ─── 1. COLLECT ──────────────────────────────────────────────────────────
  const [supabaseResult, stripeResult] = await Promise.all([
    collectSupabaseEvents(THRESHOLDS.windowMinutes).catch((e: unknown) => {
      log.error("collectSupabaseEvents failed", { message: String(e) });
      return { events: [], since: new Date(0).toISOString() };
    }),
    collectStripePayouts(THRESHOLDS.windowMinutes).catch((e: unknown) => {
      log.error("collectStripePayouts failed", { message: String(e) });
      return { recentPayouts: [], totalCount: 0, largestAmount: 0 };
    }),
  ]);

  const { events, since } = supabaseResult;
  const authSummary = summariseAuthEvents(events);
  log.info(`Collected: ${events.length} events, ${stripeResult.totalCount} stripe payouts`);

  // ─── 2. RULES ENGINE ─────────────────────────────────────────────────────
  const [authAlerts, stripeAlerts, apiAlerts, adminAlerts, scrapingAlerts] = await Promise.all([
    Promise.resolve(runAuthRules(authSummary)),
    Promise.resolve(runStripeRules(stripeResult)),
    runApiRules(since).catch((e: unknown) => { log.error("runApiRules failed", { message: String(e) }); return []; }),
    runAdminRules(since).catch((e: unknown) => { log.error("runAdminRules failed", { message: String(e) }); return []; }),
    runScrapingRules(events, since).catch((e: unknown) => { log.error("runScrapingRules failed", { message: String(e) }); return []; }),
  ]);

  const rawAlerts: SecurityAlert[] = [
    ...authAlerts,
    ...stripeAlerts,
    ...apiAlerts,
    ...adminAlerts,
    ...scrapingAlerts,
  ];

  log.info(`Rules generated ${rawAlerts.length} raw alerts`);

  if (rawAlerts.length === 0) {
    log.info("No alerts — run complete");
    return { alertsGenerated: 0, actionsExecuted: 0 };
  }

  // ─── 3. AI ENRICHMENT ────────────────────────────────────────────────────
  const enrichedAlerts: SecurityAlert[] = [];
  for (const alert of rawAlerts) {
    try {
      const [severity, summary, playbook] = await Promise.all([
        classifySeverity(alert),
        summarizeAlert(alert),
        generatePlaybook(alert),
      ]);
      enrichedAlerts.push({ ...alert, severity, summary, playbook: playbook ?? undefined });
    } catch (e: unknown) {
      log.error("AI enrichment failed for alert", { type: alert.type, message: String(e) });
      enrichedAlerts.push(alert);
    }
  }

  // ─── 4. DEDUP + PERSIST ──────────────────────────────────────────────────
  const dedupWindow = new Date(Date.now() - THRESHOLDS.dedupWindowMinutes * 60 * 1000).toISOString();
  const persistedAlerts: SecurityAlert[] = [];

  for (const alert of enrichedAlerts) {
    // Check dedup: skip if same type + ip already alerted in dedup window
    const { data: existing } = await supabaseAdmin
      .from("security_alerts")
      .select("id")
      .eq("type", alert.type)
      .eq("ip", alert.ip ?? "")
      .gte("created_at", dedupWindow)
      .limit(1);

    if (existing && existing.length > 0) {
      log.info(`Dedup: skipping ${alert.type} for ${alert.ipMasked ?? "no-ip"}`);
      continue;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("security_alerts")
      .insert({
        severity:       alert.severity,
        type:           alert.type,
        ip:             alert.ip ?? null,
        ip_masked:      alert.ipMasked ?? null,
        summary:        alert.summary,
        playbook:       alert.playbook ?? null,
        evidence:       alert.evidence ?? {},
        status:         "open",
        actions_taken:  [],
      })
      .select("id")
      .single();

    if (error) {
      log.error("Failed to persist alert", { type: alert.type, message: error.message });
    } else {
      persistedAlerts.push({ ...alert, id: inserted.id });
    }
  }

  log.info(`Persisted ${persistedAlerts.length} new alerts`);

  // ─── 5. ACTIONS ──────────────────────────────────────────────────────────
  const allActions: ActionResult[] = [];

  for (const alert of persistedAlerts) {
    const actions: ActionResult[] = [];

    if (alert.severity === "CRITICAL" || alert.severity === "HIGH") {
      if (alert.ip) {
        const blockResult = await blockIp(alert.ip, `Auto-block: ${alert.type}`, 24).catch((e: unknown) => ({
          type: "BLOCK_IP" as const, target: alert.ip!, result: "FAILED" as const, detail: String(e),
        }));
        actions.push(blockResult);

        const rlResult = await tightenRateLimit(alert.ip, 5, 60, `Auto-tighten: ${alert.type}`).catch((e: unknown) => ({
          type: "TIGHTEN_RATE_LIMIT" as const, target: alert.ip!, result: "FAILED" as const, detail: String(e),
        }));
        actions.push(rlResult);
      }
    }

    // Record actions taken
    if (actions.length > 0 && alert.id) {
      await supabaseAdmin
        .from("security_alerts")
        .update({ actions_taken: actions })
        .eq("id", alert.id);

      for (const action of actions) {
        await supabaseAdmin.from("security_actions").insert({
          alert_id:    alert.id,
          action_type: action.type,
          target:      action.target,
          result:      action.result,
          detail:      action.detail ?? null,
        });
      }
    }

    allActions.push(...actions);
  }

  // ─── 6. ALERTS ───────────────────────────────────────────────────────────
  for (const alert of persistedAlerts) {
    if (alert.severity === "LOW") continue; // only alert on MEDIUM+

    await Promise.allSettled([
      sendAdminNotification(alert),
      sendDiscordAlert(alert),
      Promise.resolve(sendEmailAlert(alert)),
    ]);
  }

  const elapsed = Date.now() - startedAt;
  log.info(`Run complete in ${elapsed}ms — ${persistedAlerts.length} alerts, ${allActions.length} actions`);

  return { alertsGenerated: persistedAlerts.length, actionsExecuted: allActions.length };
}
