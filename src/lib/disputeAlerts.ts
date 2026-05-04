import { SupabaseClient } from "@supabase/supabase-js";

const ALERT_ROLES = ["owner", "super_admin", "finance_admin"];

export type DisputeAlertPayload = {
  receipt_id: string;
  amount: number;
  creator_id: string;
  severity: "low" | "medium" | "high";
  reason?: string;
  event: "new_dispute" | "dispute_resolved" | "dispute_countered" | "approval_needed";
};

/**
 * Send targeted realtime alerts to admins by role + optional assigned admin.
 * Each admin gets an event on their personal channel: `admin-alerts-{admin_user_id}`
 */
export async function sendDisputeAlert(
  supabase: SupabaseClient,
  payload: DisputeAlertPayload,
  assignedAdminId?: string | null,
) {
  // 1. Query admins with privileged roles
  const { data: admins } = await supabase
    .from("profiles")
    .select("user_id, role")
    .in("role", ALERT_ROLES)
    .eq("is_active", true);

  const targetMap = new Map<string, { id: string; role: string }>();

  for (const a of admins ?? []) {
    targetMap.set(a.user_id, { id: a.user_id, role: a.role });
  }

  // 2. Include assigned admin (if exists and not already in list)
  if (assignedAdminId && !targetMap.has(assignedAdminId)) {
    targetMap.set(assignedAdminId, { id: assignedAdminId, role: "assigned" });
  }

  // 3. Send targeted event to each admin's personal channel
  const results: { id: string; ok: boolean }[] = [];

  for (const admin of targetMap.values()) {
    try {
      const channel = supabase.channel(`admin-alerts-${admin.id}`);
      await channel.send({
        type: "broadcast",
        event: "dispute_alert",
        payload,
      });
      await supabase.removeChannel(channel);
      results.push({ id: admin.id, ok: true });
    } catch (e) {
      console.error(`[dispute-alert] Failed to send to ${admin.id}:`, e);
      results.push({ id: admin.id, ok: false });
    }
  }

  return { sent: results.filter((r) => r.ok).length, total: targetMap.size };
}

/**
 * Look up the assigned admin for a dispute (by receipt_id / dispute_id).
 */
export async function getAssignedAdmin(
  supabase: SupabaseClient,
  receiptId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("dispute_assignments")
    .select("admin_id")
    .eq("dispute_id", receiptId)
    .maybeSingle();

  return data?.admin_id ?? null;
}
