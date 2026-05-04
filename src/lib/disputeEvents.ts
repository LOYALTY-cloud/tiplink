import { SupabaseClient } from "@supabase/supabase-js";

export type DisputeEventType =
  | "claim"
  | "release"
  | "status_change"
  | "note"
  | "system"
  | "proposal"
  | "approval"
  | "rejection";

export async function logDisputeEvent(
  supabase: SupabaseClient,
  disputeId: string,
  type: DisputeEventType,
  message: string,
  adminId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await supabase.from("dispute_events").insert({
    dispute_id: disputeId,
    admin_id: adminId ?? null,
    type,
    message,
    metadata: metadata ?? {},
  });
}
