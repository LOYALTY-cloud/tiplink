import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { checkAdminAnomalies } from "@/lib/adminRiskEngine";

export const runtime = "nodejs";

const VALID_STATUSES = ["active", "restricted", "suspended", "terminated"];

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only owner can manage admin statuses
    requireRole(session.role, ["owner"]);

    const body = await req.json();
    const { adminId, status, duration, reason } = body;

    if (!adminId || !status || !reason?.trim()) {
      return NextResponse.json({ error: "adminId, status, and reason are required" }, { status: 400 });
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Fetch the target admin
    const { data: target, error: fetchErr } = await supabaseAdmin
      .from("admins")
      .select("id, user_id, role, status, full_name")
      .eq("id", adminId)
      .maybeSingle();

    if (fetchErr || !target) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    // Cannot change own status
    if (target.user_id === session.userId) {
      return NextResponse.json({ error: "Cannot change your own status" }, { status: 403 });
    }

    // Cannot modify another owner
    if (target.role === "owner") {
      return NextResponse.json({ error: "Cannot modify another owner" }, { status: 403 });
    }

    // ── STATUS SPAM COOLDOWN ──
    // Block rapid status toggling: 5-minute cooldown between status changes for same target
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: recentChanges } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", session.userId)
      .eq("target_user", target.user_id)
      .ilike("action", "admin_%")
      .gte("created_at", fiveMinAgo);

    if ((recentChanges ?? 0) >= 3) {
      return NextResponse.json({
        error: "Cooldown active — you've changed this admin's status 3 times in the last 5 minutes. Please wait."
      }, { status: 429 });
    }

    // Build update payload
    const update: Record<string, unknown> = { status };

    if (status === "restricted" && duration) {
      const ms = parseDuration(duration);
      if (ms) {
        update.restricted_until = new Date(Date.now() + ms).toISOString();
      }
    } else {
      update.restricted_until = null;
    }

    const { error: updateErr } = await supabaseAdmin
      .from("admins")
      .update(update)
      .eq("id", adminId);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to update status: " + updateErr.message }, { status: 500 });
    }

    // Also update is_active on profiles for suspended/terminated
    if (status === "suspended" || status === "terminated") {
      await supabaseAdmin
        .from("profiles")
        .update({ is_active: false })
        .eq("user_id", target.user_id)
        .then(() => {}, () => {});
    } else if (status === "active") {
      await supabaseAdmin
        .from("profiles")
        .update({ is_active: true })
        .eq("user_id", target.user_id)
        .then(() => {}, () => {});
    }

    // Log action
    const actionLabel = `admin_${status}`;
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: actionLabel,
      target_user: target.user_id,
      reason: reason.trim(),
      severity: status === "active" ? "info" : "critical",
      metadata: {
        target_admin_id: adminId,
        target_name: target.full_name,
        previous_status: target.status,
        new_status: status,
        duration: duration || null,
      },
    }).then(() => {}, () => {});

    // Fire anomaly detection for the acting admin (non-blocking)
    checkAdminAnomalies(session.userId).catch(() => {});

    return NextResponse.json({
      ok: true,
      message: `Admin ${target.full_name} status changed to ${status}`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function parseDuration(d: string): number | null {
  const map: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  return map[d] ?? null;
}
