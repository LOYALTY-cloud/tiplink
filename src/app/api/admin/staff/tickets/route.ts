import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * Role hierarchy: owner > super_admin > admin
 * owner can write tickets to everyone
 * super_admin can write tickets to admin only
 * admin cannot write tickets to anyone
 */
const ROLE_RANK: Record<string, number> = {
  owner: 3,
  super_admin: 2,
  admin: 1,
};

const VALID_TYPES = ["warning", "performance_review", "policy_violation", "escalation", "note"];

// Helper to map profiles.role → admins-level role
function normalizeRole(profileRole: string): string {
  if (profileRole === "owner") return "owner";
  if (profileRole === "super_admin") return "super_admin";
  return "admin"; // finance_admin, support_admin → admin
}

// GET — list internal admin tickets
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const toAdmin = url.searchParams.get("to");
    const fromAdmin = url.searchParams.get("from");
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");

    let query = supabaseAdmin
      .from("admin_tickets")
      .select("*, from_admin:from_admin_id(id, full_name, role), to_admin:to_admin_id(id, full_name, role)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (toAdmin) query = query.eq("to_admin_id", toAdmin);
    if (fromAdmin) query = query.eq("from_admin_id", fromAdmin);
    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tickets: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST — create a discipline/communication ticket (hierarchy-enforced)
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { toAdminId, type, message } = body;

    if (!toAdminId || !type || !message?.trim()) {
      return NextResponse.json({ error: "toAdminId, type, and message are required" }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid ticket type. Must be: " + VALID_TYPES.join(", ") }, { status: 400 });
    }

    // Get sender's admin row + profile role
    const { data: sender } = await supabaseAdmin
      .from("admins")
      .select("id, role")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!sender) {
      return NextResponse.json({ error: "Sender admin record not found" }, { status: 404 });
    }

    // Get sender's detailed role from profiles
    const { data: senderProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", session.userId)
      .maybeSingle();

    const senderRole = normalizeRole(senderProfile?.role ?? "admin");

    // Get target admin
    const { data: target } = await supabaseAdmin
      .from("admins")
      .select("id, role, user_id")
      .eq("id", toAdminId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: "Target admin not found" }, { status: 404 });
    }

    const targetRole = target.role;

    // ── HIERARCHY CHECK ──
    // sender must outrank target
    const senderRank = ROLE_RANK[senderRole] ?? 0;
    const targetRank = ROLE_RANK[targetRole] ?? 0;

    if (senderRank <= targetRank) {
      return NextResponse.json({
        error: `${senderRole} cannot write tickets to ${targetRole}. You can only write to roles below yours.`,
      }, { status: 403 });
    }

    // Cannot write to yourself
    if (sender.id === target.id) {
      return NextResponse.json({ error: "Cannot send a ticket to yourself" }, { status: 400 });
    }

    const { data: ticket, error } = await supabaseAdmin
      .from("admin_tickets")
      .insert({
        from_admin_id: sender.id,
        to_admin_id: toAdminId,
        from_role: senderRole,
        to_role: targetRole,
        type,
        message: message.trim(),
        auto_generated: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to create ticket: " + error.message }, { status: 500 });
    }

    // Log action
    const severityMap: Record<string, string> = {
      warning: "warning",
      policy_violation: "critical",
      escalation: "warning",
      performance_review: "info",
      note: "info",
    };

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: `admin_ticket_${type}`,
      target_user: target.user_id,
      severity: severityMap[type] ?? "info",
      metadata: {
        ticket_id: ticket.id,
        type,
        from_role: senderRole,
        to_role: targetRole,
        to_admin_id: toAdminId,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, ticket });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PATCH — acknowledge or resolve a ticket
export async function PATCH(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { ticketId, action } = body;

    if (!ticketId || !action) {
      return NextResponse.json({ error: "ticketId and action are required" }, { status: 400 });
    }

    if (action !== "acknowledge" && action !== "resolve") {
      return NextResponse.json({ error: "action must be 'acknowledge' or 'resolve'" }, { status: 400 });
    }

    // Get the ticket
    const { data: ticket } = await supabaseAdmin
      .from("admin_tickets")
      .select("id, to_admin_id, from_admin_id, status, to_admin:to_admin_id(user_id), from_admin:from_admin_id(user_id)")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (action === "acknowledge") {
      // Only the recipient can acknowledge
      const toAdmin = ticket.to_admin as unknown as { user_id: string } | null;
      if (toAdmin?.user_id !== session.userId) {
        return NextResponse.json({ error: "Only the recipient can acknowledge a ticket" }, { status: 403 });
      }
      if (ticket.status !== "open") {
        return NextResponse.json({ error: "Ticket is not open" }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from("admin_tickets")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .eq("id", ticketId);

      if (error) {
        return NextResponse.json({ error: "Failed to acknowledge ticket" }, { status: 500 });
      }

      // Log acknowledgement
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: session.userId,
        action: "admin_ticket_acknowledged",
        severity: "info",
        metadata: { ticket_id: ticketId },
      }).then(() => {}, () => {});

    } else if (action === "resolve") {
      // Sender or owner can resolve
      const fromAdmin = ticket.from_admin as unknown as { user_id: string } | null;
      const { data: resolverProfile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", session.userId)
        .maybeSingle();

      const isOwner = resolverProfile?.role === "owner";
      const isSender = fromAdmin?.user_id === session.userId;

      if (!isOwner && !isSender) {
        return NextResponse.json({ error: "Only the sender or owner can resolve a ticket" }, { status: 403 });
      }

      const { error } = await supabaseAdmin
        .from("admin_tickets")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", ticketId);

      if (error) {
        return NextResponse.json({ error: "Failed to resolve ticket" }, { status: 500 });
      }

      await supabaseAdmin.from("admin_actions").insert({
        admin_id: session.userId,
        action: "admin_ticket_resolved",
        severity: "info",
        metadata: { ticket_id: ticketId },
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
