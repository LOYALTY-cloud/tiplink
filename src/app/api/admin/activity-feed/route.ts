import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

    // 1. Admin actions
    const { data, error } = await supabaseAdmin
      .from("admin_actions")
      .select(`
        id,
        action,
        metadata,
        severity,
        target_user,
        created_at,
        admin:profiles!admin_actions_admin_id_fkey (
          display_name,
          handle,
          role
        ),
        target:profiles!admin_actions_target_user_fkey (
          display_name,
          handle
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const adminFeed = (data ?? []).map((a: any) => ({
      id: a.id,
      action: a.action,
      label: formatAction(a.action, a.metadata),
      severity: a.severity,
      target_user: a.target_user,
      target_handle: a.target?.handle ?? null,
      target_display_name: a.target?.display_name ?? null,
      created_at: a.created_at,
      actor: a.admin?.display_name || a.admin?.handle || "Admin",
      role: a.admin?.role ?? "super_admin",
      metadata: a.metadata ?? {},
    }));

    // 2. Recent transactions
    const { data: txRows } = await supabaseAdmin
      .from("transactions_ledger")
      .select("id, type, amount, reference_id, user_id, created_at")
      .in("type", ["tip_received", "tip_credit", "payout", "dispute", "tip_refunded"])
      .order("created_at", { ascending: false })
      .limit(limit);

    // 3. Recent tickets
    const { data: ticketRows } = await supabaseAdmin
      .from("support_tickets")
      .select("id, subject, status, priority, user_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    // Resolve user info for tx + ticket user_ids in bulk
    const userIds = new Set<string>();
    for (const tx of txRows ?? []) if (tx.user_id) userIds.add(tx.user_id);
    for (const t of ticketRows ?? []) if (t.user_id) userIds.add(t.user_id);

    const userMap: Record<string, { display_name: string | null; handle: string | null }> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, handle")
        .in("id", Array.from(userIds));
      for (const p of profiles ?? []) {
        userMap[p.id] = { display_name: p.display_name, handle: p.handle };
      }
    }

    const txFeed = (txRows ?? []).map((tx: any) => {
      const u = userMap[tx.user_id] ?? {};
      const action = tx.type === "tip_credit" ? "tip_received" : tx.type;
      return {
        id: tx.id,
        action,
        label: formatTx(tx.type, tx.amount),
        severity: tx.type === "dispute" ? "high" : "low",
        target_user: tx.user_id,
        target_handle: u.handle ?? null,
        target_display_name: u.display_name ?? null,
        created_at: tx.created_at,
        actor: "System",
        role: "system",
        metadata: { amount: tx.amount, type: tx.type, reference_id: tx.reference_id ?? null, tip_id: tx.reference_id ?? null },
      };
    });

    const ticketFeed = (ticketRows ?? []).map((t: any) => {
      const u = userMap[t.user_id] ?? {};
      const action = t.status === "resolved" ? "ticket_resolved"
        : t.status === "closed" ? "ticket_closed"
        : "ticket_updated";
      return {
        id: `ticket-${t.id}`,
        action,
        label: `${action === "ticket_resolved" ? "Resolved" : action === "ticket_closed" ? "Closed" : "Ticket"}: ${t.subject}`,
        severity: Number(t.priority ?? 0) >= 2 ? "high" : "medium",
        target_user: t.user_id,
        target_handle: u.handle ?? null,
        target_display_name: u.display_name ?? null,
        created_at: t.updated_at ?? t.created_at,
        actor: "System",
        role: "system",
        metadata: { ticket_id: t.id, subject: t.subject, status: t.status, priority: t.priority },
      };
    });

    // Merge all sources, sort by time desc, cap at limit
    const feed = [...adminFeed, ...txFeed, ...ticketFeed]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return NextResponse.json({ data: feed });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

function formatTx(type: string, amount: number) {
  const abs = Math.abs(Number(amount ?? 0)).toFixed(2);
  switch (type) {
    case "tip_received":
    case "tip_credit":
      return `Tip received — $${abs}`;
    case "payout":
      return `Payout processed — $${abs}`;
    case "dispute":
      return `Dispute filed — $${abs}`;
    case "tip_refunded":
      return `Tip refunded — $${abs}`;
    default:
      return `${type.replace(/_/g, " ")} — $${abs}`;
  }
}

function formatAction(action: string, meta: any) {
  switch (action) {
    case "set_role":
      return `Changed role to ${meta?.new_role ?? "unknown"}`;
    case "restrict":
    case "update_status":
      return meta?.new_status ? `Set account ${meta.new_status}` : "Updated account status";
    case "suspend":
      return "Suspended account";
    case "close":
      return "Closed account";
    case "refund":
      return meta?.amount
        ? `Issued refund $${Number(meta.amount).toFixed(2)}${meta?.reason ? ` (${meta.reason})` : ""}`
        : "Issued refund";
    case "refund_request":
      return meta?.amount
        ? `Requested refund $${Number(meta.amount).toFixed(2)}${meta?.reason ? ` — ${meta.reason}` : ""}`
        : "Requested refund";
    case "refund_approve":
      return meta?.amount
        ? `Approved refund $${Number(meta.amount).toFixed(2)}`
        : "Approved refund";
    case "refund_reject":
      return meta?.amount
        ? `Rejected refund $${Number(meta.amount).toFixed(2)}`
        : "Rejected refund";
    case "bulk_restrict":
      return `Bulk restricted ${meta?.count ?? "?"} users`;
    case "auto_restrict":
      return `Auto-restricted: ${meta?.reason ?? "risk alert"}`;
    case "risk_eval":
      return meta?.restricted ? "Risk eval → restricted" : "Risk eval → clear";
    default:
      return action.replace(/_/g, " ");
  }
}
