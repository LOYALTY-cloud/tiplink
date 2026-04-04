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

export type FreezeContext = {
  userId: string;
  trust_score: number;
  recent_chargeback: boolean;
  multi_account_flag: boolean;
  rapid_withdrawals: boolean;
  activity_spike: boolean;
};

/**
 * Determine if the user should be auto-frozen. Returns reason string or null.
 */
export function shouldAutoFreeze(ctx: FreezeContext): string | null {
  if (ctx.trust_score < 25) return "Trust score critically low";
  if (ctx.recent_chargeback) return "Recent chargeback detected";
  if (ctx.multi_account_flag) return "Multiple accounts detected";
  if (ctx.rapid_withdrawals) return "Rapid withdrawal pattern";
  return null;
}

/**
 * Execute auto-freeze: update profile, log admin action, insert fraud anomaly.
 * Idempotent — skips if already frozen.
 */
export async function executeAutoFreeze(
  userId: string,
  reason: string
): Promise<void> {
  // Check if already frozen to avoid duplicate logging
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_frozen")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.is_frozen) return;

  const now = new Date().toISOString();

  // Freeze the profile
  await supabaseAdmin
    .from("profiles")
    .update({
      is_frozen: true,
      freeze_reason: reason,
      frozen_at: now,
      account_status: "restricted",
      status_reason: `auto_freeze: ${reason}`,
    })
    .eq("user_id", userId);

  // Log system action
  await supabaseAdmin.from("admin_actions").insert({
    admin_id: null,
    action: "auto_freeze",
    target_user: userId,
    severity: "critical",
    metadata: { reason, frozen_at: now, source: "system" },
  });

  // Insert fraud anomaly for visibility on the fraud dashboard
  await supabaseAdmin.from("fraud_anomalies").insert({
    user_id: userId,
    type: "auto_freeze",
    score: 95,
    decision: "restrict",
    reason,
    flags: ["auto_freeze", reason.toLowerCase().replace(/\s+/g, "_")],
    context: { reason, frozen_at: now },
  });
}
