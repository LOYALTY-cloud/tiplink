import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

// DELETE /api/admin/remove-admin
// Permanently revokes admin access for the specified admin.
// Owner-only. Cannot target another owner.
export async function DELETE(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only owners can permanently remove admins
    try { requireRole(session.role, ["owner"]); } catch {
      return NextResponse.json({ error: "Only the owner can remove admin access" }, { status: 403 });
    }

    const body = await req.json();
    const { admin_id: targetAdminId, reason } = body as { admin_id?: string; reason?: string };

    if (!targetAdminId?.trim()) {
      return NextResponse.json({ error: "admin_id is required" }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    // Fetch the target admin row (id = admins.id UUID)
    const { data: target, error: fetchErr } = await supabaseAdmin
      .from("admins")
      .select("id, user_id, full_name, role, status")
      .eq("id", targetAdminId)
      .maybeSingle();

    if (fetchErr || !target) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    // Cannot remove another owner
    if (target.role === "owner") {
      return NextResponse.json({ error: "Cannot remove owner admin access" }, { status: 403 });
    }

    // Cannot remove yourself
    if (target.user_id === session.userId) {
      return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
    }

    // 1) Demote in profiles — clear admin fields, reset role to 'user'
    await supabaseAdmin
      .from("profiles")
      .update({
        role: "user",
        admin_id: null,
        admin_passcode: null,
      })
      .eq("user_id", target.user_id);

    // 2) Delete from admins table
    const { error: deleteErr } = await supabaseAdmin
      .from("admins")
      .delete()
      .eq("id", target.id);

    if (deleteErr) {
      return NextResponse.json({ error: "Failed to remove admin record" }, { status: 500 });
    }

    // 3) Fetch actor name for logs
    const { data: actorProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", session.userId)
      .maybeSingle();

    // 4) Fetch target email for record
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", target.user_id)
      .maybeSingle();

    // 5) Log to admin_assignments audit trail
    await supabaseAdmin.from("admin_assignments").insert({
      user_id: target.user_id,
      full_name: target.full_name,
      email: targetProfile?.email ?? null,
      role: target.role,
      action: "removed",
      performed_by: session.userId,
      performed_by_name: actorProfile?.display_name ?? null,
      reason: reason.trim(),
    }).then(() => {}, () => {});

    // 6) Log to admin_actions
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "remove_admin",
      target_user: target.user_id,
      reason: reason.trim(),
      severity: "critical",
      metadata: {
        target_name: target.full_name,
        target_role: target.role,
        target_admin_id: target.id,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
