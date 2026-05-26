import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/users/[userId]/store
 * Toggle store_disabled on a creator's profile.
 * Only callable if the user has an active creator_store.
 *
 * Body: { disabled: boolean }
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
    const body = await req.json() as { disabled: boolean };

    if (typeof body.disabled !== "boolean") {
      return NextResponse.json({ error: "disabled must be a boolean" }, { status: 400 });
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

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ store_disabled: body.disabled })
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    // Audit log
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: admin.userId,
      target_user: userId,
      action: body.disabled ? "store_disabled" : "store_enabled",
      metadata: { note: body.disabled ? "Admin disabled creator store" : "Admin re-enabled creator store" },
    });

    return NextResponse.json({ ok: true, store_disabled: body.disabled });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
