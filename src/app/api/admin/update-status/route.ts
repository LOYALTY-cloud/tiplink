import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { notifyAdmins, createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const ALLOWED_STATUSES = ["active", "restricted", "suspended", "closed", "closed_finalized"];

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "restrict");
    const adminId = session.userId;

    const { user_id, status, confirm_text, reason, restricted_until } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }
    // Danger zone: closing or suspending requires typed confirmation
    if ((status === "closed" || status === "suspended") && confirm_text !== status.toUpperCase()) {
      return NextResponse.json({ error: `Dangerous action: type ${status.toUpperCase()} to confirm` }, { status: 400 });
    }
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      account_status: status,
      status_reason: reason ? String(reason).slice(0, 500) : `admin_action_by_${adminId}`,
    };
    if (status === "closed" || status === "closed_finalized") {
      update.closed_at = new Date().toISOString();
    }
    // Auto-unlock: compute restricted_until timestamp from duration string
    if (status === "restricted" && restricted_until) {
      // Escalation: fetch current restriction count
      const { data: currentProfile } = await supabaseAdmin
        .from("profiles")
        .select("restriction_count")
        .eq("user_id", user_id)
        .maybeSingle();

      const count = (currentProfile?.restriction_count ?? 0) + 1;
      update.restriction_count = count;

      // 3+ restrictions → permanent (override any duration)
      if (count >= 3) {
        update.restricted_until = null; // permanent
        update.status_reason = `Permanent restriction (${count} offenses). ${reason ? String(reason).slice(0, 400) : ""}`.trim();
      } else {
        const durations: Record<string, number> = { "24h": 24, "72h": 72, "7d": 168, "30d": 720 };
        const hours = durations[String(restricted_until)];
        if (hours) {
          update.restricted_until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        }
      }
    }
    // Clear restriction fields when re-activating
    if (status === "active") {
      update.restricted_until = null;
      update.status_reason = reason ? String(reason).slice(0, 500) : null;
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("user_id", user_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "update_status",
      target_user: user_id,
      metadata: { new_status: status, reason: reason ? String(reason).slice(0, 500) : null },
      severity: (status === "closed" || status === "suspended") ? "critical" : "info",
    });

    // Notify all admins on status changes that need attention
    if (status === "restricted" || status === "suspended" || status === "closed") {
      notifyAdmins({
        title: `Account ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        body: `Admin ${adminId} set user ${user_id} to ${status}. Reason: ${reason || "none"}`,
      }).catch(() => {});
    }

    // Notify the USER immediately via email + in-app
    if (status === "restricted" || status === "suspended" || status === "closed") {
      // Determine security action sub-type
      const isPermRestriction = status === "restricted" && !update.restricted_until;
      const actionMap: Record<string, string> = {
        restricted: isPermRestriction ? "restricted_permanent" : "restricted_temp",
        suspended: "suspended",
        closed: "closed",
      };

      const titleMap: Record<string, string> = {
        restricted: isPermRestriction
          ? "Your 1neLink account is under review"
          : "Your 1neLink account has been temporarily restricted",
        suspended: "Your 1neLink account has been suspended",
        closed: "Your 1neLink account has been closed",
      };

      // Compute human-readable duration for temp restrictions
      const durationLabel = update.restricted_until
        ? restricted_until // e.g. "24h", "7d"
        : undefined;

      createNotification({
        userId: user_id,
        type: "security",
        title: titleMap[status] ?? "Account status updated",
        body: "Your account status has changed. Please check your dashboard.",
        meta: {
          action: actionMap[status] as "restricted_temp" | "restricted_permanent" | "suspended" | "closed",
          reason: reason || update.status_reason || undefined,
          restrictedUntil: durationLabel,
        },
      }).catch(() => {});
    }

    // Notify the user when their account is re-activated
    if (status === "active") {
      createNotification({
        userId: user_id,
        type: "security",
        title: "Your 1neLink account is active again",
        body: "Your account has been restored.",
        meta: {
          action: "reactivated",
        },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, user_id, status });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
