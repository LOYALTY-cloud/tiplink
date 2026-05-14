/**
 * Auto-Freeze Engine
 *
 * Evaluates whether a user should be instantly frozen based on
 * high-confidence fraud signals. Returns a reason string if freeze
 * is warranted, or null if the user is clear.
 *
 * Called from: withdrawal API, fraud orchestrator, login guards.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { logFreezeEvent } from "@/lib/freezeAudit";
import { sendFreezeEmail } from "@/lib/sendFreezeEmail";
import { sendAdminAlert } from "@/lib/adminAlerts";
import {
  collectFreezeSignals,
  buildFreezeReason,
  summarizeFreeze,
  generateFreezeExplanation,
} from "@/lib/freezeExplanation";

export type FreezeContext = {
  userId: string;
  trust_score: number;
  recent_chargeback: boolean;
  multi_account_flag: boolean;
  rapid_withdrawals: boolean;
  activity_spike: boolean;
  // Optional signal enrichment
  new_device?: boolean;
  new_ip?: boolean;
  ledger_drift?: boolean;
  tip_withdraw_loop?: boolean;
};

export type FreezeResult = {
  reason: string;
  level: "soft" | "hard";
  signals: string[];
};

/**
 * Determine if the user should be auto-frozen. Returns reason + level + signals, or null.
 */
export function shouldAutoFreeze(ctx: FreezeContext): FreezeResult | null {
  // Collect all active signal keys
  const signals = collectFreezeSignals(ctx);

  // Hard freezes: require admin review
  if (ctx.recent_chargeback) {
    return { reason: buildFreezeReason(signals), level: "hard", signals };
  }
  if (ctx.multi_account_flag) {
    return { reason: buildFreezeReason(signals), level: "hard", signals };
  }

  // Soft freezes: user can self-serve unfreeze
  if (ctx.trust_score < 25) {
    return { reason: buildFreezeReason(signals), level: "soft", signals };
  }
  if (ctx.rapid_withdrawals) {
    return { reason: buildFreezeReason(signals), level: "soft", signals };
  }
  return null;
}

/**
 * Execute auto-freeze: update profile, log admin action, insert fraud anomaly.
 * Idempotent — skips if already frozen.
 */
export async function executeAutoFreeze(
  userId: string,
  reason: string,
  level: "soft" | "hard" = "soft",
  signals: string[] = []
): Promise<void> {
  // Check if already frozen or in a temp-unfreeze window — avoid disrupting it
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_frozen, temp_unfreeze_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.is_frozen) return;

  // Don't auto-freeze someone whose temp unfreeze window is still active
  if (profile?.temp_unfreeze_until && new Date(profile.temp_unfreeze_until) > new Date()) return;

  const now = new Date().toISOString();
  const explanations = signals.length > 0 ? generateFreezeExplanation(signals) : [];
  const summary = signals.length > 0 ? summarizeFreeze(signals) : null;

  // Freeze the profile
  await supabaseAdmin
    .from("profiles")
    .update({
      is_frozen: true,
      freeze_reason: reason,
      freeze_level: level,
      frozen_at: now,
      account_status: "restricted",
      status_reason: `auto_freeze: ${reason}`,
    })
    .eq("user_id", userId);

  // Log system action
  await supabaseAdmin.from("admin_actions").insert({
    admin_id: "00000000-0000-0000-0000-000000000000",
    action: "auto_freeze",
    target_user: userId,
    severity: "critical",
    metadata: { reason, frozen_at: now, source: "system", signals, explanations, summary },
  });

  // Insert fraud anomaly for visibility on the fraud dashboard
  await supabaseAdmin.from("fraud_anomalies").insert({
    user_id: userId,
    type: "auto_freeze",
    score: 95,
    decision: "restrict",
    reason,
    flags: ["auto_freeze", ...signals],
    context: { reason, frozen_at: now, signals, explanations, summary },
  });

  // Audit trail — dedicated freeze log
  await logFreezeEvent({
    userId,
    action: "freeze",
    freezeLevel: level,
    reason,
    triggeredBy: "system",
    metadata: { frozen_at: now, source: "auto_freeze", signals, explanations, summary },
  });

  // Notify the user via in-app notification
  const notificationBody = summary
    ? `${summary}\n${explanations.map((e) => `• ${e}`).join("\n")}`
    : level === "hard"
      ? `Your account has been restricted due to: ${reason}. Please contact support for assistance.`
      : `Your withdrawals have been temporarily restricted due to: ${reason}. You can verify your identity to restore access from your dashboard.`;

  try {
    await createNotification({
      userId,
      type: "security",
      title: level === "hard"
        ? "Account restricted — support review required"
        : "Account restricted — action required",
      body: notificationBody,
      meta: {
        action: "restricted_temp",
        reason,
        freeze_level: level,
      },
    });
  } catch (_) {
    // Notification failure must never block freeze execution
  }

  // Dedicated freeze email (clear + actionable)
  try {
    const { data: emailProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, handle")
      .eq("user_id", userId)
      .maybeSingle();

    if (emailProfile?.email) {
      await sendFreezeEmail({
        email: emailProfile.email,
        reason,
        freezeLevel: level,
        handle: emailProfile.handle,
        explanations,
        summary: summary ?? undefined,
      });
    }
  } catch (_) {
    // Email failure must never block freeze execution
  }

  // Alert the internal team
  sendAdminAlert({
    subject: "Suspicious activity — account auto-frozen",
    body: `User ${userId} was auto-frozen (${level}). Reason: ${reason}`,
    severity: "critical",
    meta: { user_id: userId, level, reason, signals: signals.join(", ") },
  });
}
