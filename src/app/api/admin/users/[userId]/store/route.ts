import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { sendEmailAsync } from "@/lib/emailService";
import { buildStoreDisabledEmail } from "@/lib/email/sendStoreDisabled";
import { buildStoreEnabledEmail } from "@/lib/email/sendStoreEnabled";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/users/[userId]/store
 * Toggle store_disabled on a creator's profile.
 * Only callable if the user has an active creator_store.
 *
 * Body: {
 *   disabled: boolean,
 *   reason?: string,       // required when disabled=true
 *   duration_days?: number | null  // null = indefinite
 * }
 */
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(admin.role, ["owner", "super_admin", "support_admin"]);

    const { userId } = params;
    const body = await req.json() as {
      disabled: boolean;
      reason?: string;
      duration_days?: number | null;
    };

    if (typeof body.disabled !== "boolean") {
      return NextResponse.json({ error: "disabled must be a boolean" }, { status: 400 });
    }

    if (body.disabled) {
      const reason = (body.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json({ error: "reason is required when disabling a store" }, { status: 400 });
      }
    }

    // Confirm the user actually has an active store before allowing toggle
    const { data: store } = await supabaseAdmin
      .from("creator_stores")
      .select("id, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (!store || !store.is_active) {
      return NextResponse.json(
        { error: "No active store found for this user" },
        { status: 422 },
      );
    }

    // Calculate the until timestamp when a duration is provided
    let storeDisabledUntil: string | null = null;
    if (body.disabled && body.duration_days != null && body.duration_days > 0) {
      const until = new Date();
      until.setDate(until.getDate() + body.duration_days);
      storeDisabledUntil = until.toISOString();
    }

    const updatePayload = body.disabled
      ? {
          store_disabled: true,
          store_disabled_reason: (body.reason ?? "").trim() || null,
          store_disabled_until: storeDisabledUntil,
        }
      : {
          store_disabled: false,
          store_disabled_reason: null,
          store_disabled_until: null,
        };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(updatePayload)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    // Audit log
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: admin.userId,
      target_user: userId,
      action: body.disabled ? "store_disabled" : "store_enabled",
      metadata: {
        reason: body.disabled ? (body.reason ?? null) : null,
        duration_days: body.disabled ? (body.duration_days ?? null) : null,
        until: storeDisabledUntil,
      },
    });

    // Send email to creator (non-blocking)
    const { data: creatorData } = await supabaseAdmin
      .from("profiles")
      .select("email, display_name, handle")
      .eq("user_id", userId)
      .maybeSingle();

    if (creatorData?.email) {
      if (body.disabled) {
        const emailHtml = buildStoreDisabledEmail({
          displayName: creatorData.display_name ?? creatorData.handle ?? undefined,
          reason: (body.reason ?? "").trim(),
          durationDays: body.duration_days ?? null,
          disabledUntil: storeDisabledUntil,
        });
        sendEmailAsync({
          type: "STORE_DISABLED",
          to: creatorData.email,
          subject: "Your 1neLink store has been temporarily restricted",
          html: emailHtml,
        });
      } else {
        const emailHtml = buildStoreEnabledEmail({
          displayName: creatorData.display_name ?? creatorData.handle ?? undefined,
        });
        sendEmailAsync({
          type: "STORE_ENABLED",
          to: creatorData.email,
          subject: "Your 1neLink store has been re-enabled",
          html: emailHtml,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      store_disabled: body.disabled,
      store_disabled_until: storeDisabledUntil,
      store_disabled_reason: body.disabled ? (body.reason ?? null) : null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
