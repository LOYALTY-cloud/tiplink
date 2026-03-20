import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = await getAdminFromSession(jwt);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

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

    const feed = (data ?? []).map((a: any) => ({
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
    }));

    return NextResponse.json({ data: feed });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
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
