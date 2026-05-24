import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/** PATCH /api/admin/reports/[id] — update status, notes, priority */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const body = await req.json() as {
      status?: string;
      priority?: string;
      moderation_action?: string;
      resolved_notes?: string;
      requires_manual_review?: boolean;
    };

    const VALID_STATUSES   = ["pending", "reviewing", "resolved", "dismissed"];
    const VALID_PRIORITIES = ["low", "normal", "high", "critical"];

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }

    const isResolved = body.status === "resolved" || body.status === "dismissed";

    const update: Record<string, unknown> = {};
    if (body.status    !== undefined) update.status             = body.status;
    if (body.priority  !== undefined) update.priority           = body.priority;
    if (body.moderation_action !== undefined) update.moderation_action = body.moderation_action;
    if (body.resolved_notes    !== undefined) update.resolved_notes    = body.resolved_notes;
    if (body.requires_manual_review !== undefined) update.requires_manual_review = body.requires_manual_review;

    if (isResolved) {
      update.reviewed_by  = session.userId;
      update.reviewed_at  = new Date().toISOString();
    } else if (body.status === "reviewing" && !update.reviewed_by) {
      // Assign reviewer when they start reviewing
      update.reviewed_by = session.userId;
    }

    const { data, error } = await supabaseAdmin
      .from("reports")
      .update(update)
      .eq("id", id)
      .select("id, status, priority, reviewed_by, reviewed_at")
      .single();

    if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

    // Log to admin_actions
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: `report_${body.status ?? "updated"}`,
      target_user: null,
      reason: body.resolved_notes ?? body.moderation_action ?? null,
      severity: "info",
      metadata: {
        report_id: id,
        new_status: body.status,
        moderation_action: body.moderation_action,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({ success: true, report: data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** GET /api/admin/reports/[id] — get single report detail */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("reports")
      .select(`
        *,
        reporter:profiles!reports_reporter_id_fkey (user_id, display_name, handle, email, avatar_url),
        target_owner:profiles!reports_target_owner_id_fkey (user_id, display_name, handle, email, avatar_url)
      `)
      .eq("id", id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ report: data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
