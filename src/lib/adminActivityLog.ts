import { supabaseAdmin } from "@/lib/supabase/admin";

// Snapshot shape stored in rollback_data for reversible actions.
// Each entry describes one row's before-state; the rollback engine
// uses this to restore affected records.
export type RollbackEntry = {
  table: string;       // e.g. "transactions_ledger"
  id: string;          // row primary key
  field: string;       // column being restored, e.g. "status"
  before: unknown;     // previous value
};

type AdminActivityType = "payment" | "withdrawal" | "disciplinary" | "support" | "fraud" | "system" | "admin_action";

type LogAdminActivityParams = {
  type: AdminActivityType;
  title: string;
  description?: string | null;
  relatedId?: string | null;
  metadata?: Record<string, unknown> | null;

  // Reversibility — pass these for AI-executed state changes
  reversible?: boolean;
  rollbackData?: RollbackEntry[] | null;

  // Compatibility fields for existing legacy views.
  actor?: string | null;
  action?: string | null;
  label?: string | null;
  severity?: string | null;
  targetUser?: string | null;
  targetHandle?: string | null;
  targetDisplayName?: string | null;
};

// Returns the inserted row id so callers can surface it for undo UI.
export async function logAdminActivity({
  type,
  title,
  description,
  relatedId,
  metadata,
  reversible = false,
  rollbackData = null,
  actor,
  action,
  label,
  severity,
  targetUser,
  targetHandle,
  targetDisplayName,
}: LogAdminActivityParams): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("admin_activity_log")
    .insert({
      type,
      title,
      description: description ?? null,
      related_id: relatedId ?? null,
      metadata: metadata ?? {},
      reversible,
      rollback_data: rollbackData ?? null,
      actor: actor ?? null,
      action: action ?? null,
      label: label ?? null,
      severity: severity ?? "info",
      target_user: targetUser ?? null,
      target_handle: targetHandle ?? null,
      target_display_name: targetDisplayName ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id as string;
}
