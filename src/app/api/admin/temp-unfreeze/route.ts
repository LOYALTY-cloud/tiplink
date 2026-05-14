import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { logFreezeEvent } from "@/lib/freezeAudit";
import { createNotification } from "@/lib/notifications";
import { sendTempUnfreezeEmail } from "@/lib/sendUnfreezeEmail";

export const runtime = "nodejs";

const VALID_HOURS = [1, 2, 4, 6, 12, 24] as const;
type ValidHours = typeof VALID_HOURS[number];

/**
 * POST /api/admin/temp-unfreeze
 * 
 * Grants a frozen account a temporary window to withdraw funds.
 * The account stays frozen (is_frozen = true) but checkSoftRestrictions
 * allows withdrawals while temp_unfreeze_until is in the future.
 * After expiry the freeze resumes automatically — no cron needed.
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    requireRole(session.role, "restrict");

    const { user_id, hours } = await req.json();

    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const parsedHours = Number(hours);
    if (!VALID_HOURS.includes(parsedHours as ValidHours)) {
      return NextResponse.json(
        { error: `hours must be one of: ${VALID_HOURS.join(", ")}` },
        { status: 400 }
      );
    }

    // Confirm the account is actually frozen + grab email/handle for notification
    const { data: profile, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("is_frozen, freeze_reason, freeze_level, email, handle")
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!profile.is_frozen) {
      return NextResponse.json({ error: "Account is not frozen" }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + parsedHours * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ temp_unfreeze_until: expiresAt })
      .eq("user_id", user_id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to set temp unfreeze" }, { status: 500 });
    }

    // Audit trail
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "temp_unfreeze",
      target_user: user_id,
      severity: "warning",
      metadata: {
        hours: parsedHours,
        expires_at: expiresAt,
        previous_freeze_reason: profile.freeze_reason,
      },
    });

    await logFreezeEvent({
      userId: user_id,
      action: "unfreeze",
      freezeLevel: profile.freeze_level as "soft" | "hard" | null,
      reason: `Temporary unfreeze (${parsedHours}h window) granted by admin`,
      triggeredBy: "admin",
      adminId: session.userId,
      metadata: { type: "temp_unfreeze", hours: parsedHours, expires_at: expiresAt },
    });

    // In-app notification
    await createNotification({
      userId: user_id,
      type: "security",
      title: "Withdrawal window opened",
      body: `An admin has temporarily enabled withdrawals on your account for ${parsedHours} hour${parsedHours !== 1 ? "s" : ""}. Please withdraw your funds before the window closes.`,
      meta: { action: "temp_unfreeze", expires_at: expiresAt },
    });

    // Email notification
    if (profile.email) {
      sendTempUnfreezeEmail({
        email: profile.email,
        handle: profile.handle,
        hours: parsedHours,
        expiresAt,
      }).catch((e) => console.error("[temp-unfreeze] sendTempUnfreezeEmail failed:", e));
    }

    return NextResponse.json({ ok: true, expires_at: expiresAt });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("temp-unfreeze error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
