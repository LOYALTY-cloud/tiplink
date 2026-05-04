/**
 * AI Action Rollback Engine
 *
 * Restores database state captured in admin_activity_log.rollback_data.
 *
 * Contract:
 *   - Only entries with reversible=true and rolled_back=false can be undone.
 *   - Rollback re-applies each `before` value to the named table + id + field.
 *   - External side-effects (Stripe payouts, emails) are NEVER reversed here.
 *   - Both the rollback and its outcome are written to the audit log.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAdminActivity, type RollbackEntry } from "@/lib/adminActivityLog";

// ── Types ────────────────────────────────────────────────────────────────────

export type RollbackResult = {
  ok: boolean;
  logId: string;
  restored: number;
  failed: number;
  errors: string[];
};

// ── Main rollback function ────────────────────────────────────────────────────

export async function rollbackAction(
  logId: string,
  requestedBy: string,
): Promise<RollbackResult> {
  // 1. Fetch the log row
  const { data: log, error: fetchError } = await supabaseAdmin
    .from("admin_activity_log")
    .select("id, reversible, rolled_back, rollback_data, title, action")
    .eq("id", logId)
    .single();

  if (fetchError || !log) {
    throw new Error("Log entry not found");
  }

  if (!log.reversible) {
    throw new Error("This action is not reversible");
  }

  if (log.rolled_back) {
    throw new Error("This action has already been rolled back");
  }

  const entries = (log.rollback_data ?? []) as RollbackEntry[];

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("No rollback data captured for this action");
  }

  // 2. Restore each row to its before-state
  let restored = 0;
  let failed = 0;
  const errors: string[] = [];

  // Group entries by table for clarity; process all sequentially to keep
  // restore order predictable and avoid race conditions.
  for (const entry of entries) {
    const { table, id, field, before } = entry;

    if (!table || !id || !field) {
      errors.push(`Invalid rollback entry: ${JSON.stringify(entry)}`);
      failed++;
      continue;
    }

    // Security: only allow writes to tables the rollback system owns.
    if (!ALLOWED_TABLES.has(table)) {
      errors.push(`Table not allowed for rollback: ${table}`);
      failed++;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from(table as any)
      .update({
        [field]: before,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      errors.push(`${table}/${id}: ${updateError.message}`);
      failed++;
    } else {
      restored++;
    }
  }

  // 3. Mark the log entry as rolled back
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("admin_activity_log")
    .update({
      rolled_back: true,
      rolled_back_at: now,
      rolled_back_by: requestedBy,
    })
    .eq("id", logId);

  // 4. Write a new audit log entry for the rollback itself
  await logAdminActivity({
    type: "system",
    action: "ai_rollback_executed",
    title: `Rollback: ${log.title ?? log.action ?? "AI action"}`,
    description: `Restored ${restored} records. ${failed > 0 ? `${failed} failed.` : ""}`,
    severity: failed > 0 ? "warning" : "info",
    metadata: {
      original_log_id: logId,
      restored,
      failed,
      errors: errors.slice(0, 10),
    },
    actor: requestedBy,
  });

  return { ok: true, logId, restored, failed, errors };
}

// ── Safety allowlist ─────────────────────────────────────────────────────────
// Only internal state tables. Never Stripe, email, or external API records.

const ALLOWED_TABLES = new Set([
  "transactions_ledger",   // retry payment status resets
  "profiles",              // flag / restriction rollbacks
  "admin_notifications",   // notification state rollbacks
]);
