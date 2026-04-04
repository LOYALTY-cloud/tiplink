import { supabaseAdmin } from "@/lib/supabase/admin";

type AutoTicketParams = {
  targetUserId: string;
  type: "warning" | "performance_review" | "policy_violation" | "escalation" | "note";
  message: string;
};

/**
 * Auto-generate an admin discipline ticket from the system.
 * Used by fraud detection, behavior tracking, and other automated systems.
 *
 * Hierarchy: auto-tickets are issued as "owner" level (system authority).
 * The "from" admin is the first owner found, or falls back to system.
 */
export async function createAutoAdminTicket({
  targetUserId,
  type,
  message,
}: AutoTicketParams): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
  try {
    // Get the target's admin row
    const { data: targetAdmin } = await supabaseAdmin
      .from("admins")
      .select("id, role")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!targetAdmin) {
      return { ok: false, error: "Target is not in the admins table" };
    }

    // Get the owner admin row as the "from" (system authority)
    const { data: ownerAdmin } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (!ownerAdmin) {
      return { ok: false, error: "No owner admin found for auto-ticket" };
    }

    const { data: ticket, error } = await supabaseAdmin
      .from("admin_tickets")
      .insert({
        from_admin_id: ownerAdmin.id,
        to_admin_id: targetAdmin.id,
        from_role: "owner",
        to_role: targetAdmin.role,
        type,
        message,
        auto_generated: true,
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    // Log the auto-generated ticket
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: targetUserId,
      action: `auto_ticket_${type}`,
      severity: type === "warning" || type === "policy_violation" ? "warning" : "info",
      metadata: {
        ticket_id: ticket.id,
        type,
        auto_generated: true,
        message: message.slice(0, 200),
      },
    }).then(() => {}, () => {});

    return { ok: true, ticketId: ticket.id };
  } catch {
    return { ok: false, error: "Failed to create auto-ticket" };
  }
}
