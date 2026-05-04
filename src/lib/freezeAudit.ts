/**
 * Freeze Audit Logger
 *
 * Records every freeze/unfreeze event in `account_freeze_logs`.
 * Called from autoFreeze, self-serve unfreeze, and admin unfreeze.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type FreezeLogEntry = {
  userId: string;
  action: "freeze" | "unfreeze";
  freezeLevel?: "soft" | "hard" | null;
  reason: string;
  triggeredBy: "system" | "admin" | "self";
  adminId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logFreezeEvent(entry: FreezeLogEntry): Promise<void> {
  try {
    await supabaseAdmin.from("account_freeze_logs").insert({
      user_id: entry.userId,
      action: entry.action,
      freeze_level: entry.freezeLevel ?? null,
      reason: entry.reason,
      triggered_by: entry.triggeredBy,
      admin_id: entry.adminId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    // Non-blocking — audit logging must never break freeze flow
    console.error("Failed to log freeze event:", err);
  }
}
