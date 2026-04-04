import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { generateAdminId, validateAdminIdPrefix } from "@/lib/auth/generateAdminId";

export const runtime = "nodejs";

const ASSIGNABLE_ROLES = [
  "super_admin",
  "finance_admin",
  "support_admin",
  "user",
];

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only owner and super_admin can assign roles
    requireRole(session.role, ["owner", "super_admin"]);

    const { target_user_id, new_role, first_name, last_name, email } = await req.json();

    if (!target_user_id || typeof target_user_id !== "string") {
      return NextResponse.json({ error: "Missing target_user_id" }, { status: 400 });
    }
    if (!ASSIGNABLE_ROLES.includes(new_role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(", ")}` },
        { status: 400 },
      );
    }

    // Admin roles require first_name, last_name, email
    const isAdminRole = new_role !== "user";
    // Verify target user exists
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, user_id, admin_id, email, first_name, last_name, display_name")
      .eq("user_id", target_user_id)
      .maybeSingle();

    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // For admin roles, fill blanks from existing profile or auth user
    let resolvedFirstName = first_name?.trim() || target.first_name || "";
    let resolvedLastName = last_name?.trim() || target.last_name || "";
    let resolvedEmail = email?.trim() || target.email || "";

    // Try to extract first/last from display_name if still empty
    if ((!resolvedFirstName || !resolvedLastName) && target.display_name) {
      const parts = target.display_name.trim().split(/\s+/);
      if (!resolvedFirstName) resolvedFirstName = parts[0] || "";
      if (!resolvedLastName) resolvedLastName = parts.slice(1).join(" ") || "";
    }

    // Fall back to auth email if profile email is empty
    if (!resolvedEmail) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(target_user_id);
      resolvedEmail = authUser?.user?.email || "";
    }

    if (isAdminRole) {
      if (!resolvedFirstName || !resolvedLastName || !resolvedEmail) {
        return NextResponse.json({ error: "First name, last name, and email are required for admin roles" }, { status: 400 });
      }
    }

    // Prevent owner from changing their own role
    if (target.user_id === session.userId) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 },
      );
    }

    // Cannot change another owner's role
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change another owner's role" },
        { status: 400 },
      );
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = { role: new_role };

    if (isAdminRole) {
      updatePayload.first_name = resolvedFirstName;
      updatePayload.last_name = resolvedLastName;
      updatePayload.display_name = `${resolvedFirstName} ${resolvedLastName}`;
      updatePayload.email = resolvedEmail.toLowerCase();

      // Generate admin_id if not already set — existing IDs are immutable
      if (!target.admin_id) {
        let adminId = generateAdminId(new_role);
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data: collision } = await supabaseAdmin
            .from("profiles")
            .select("admin_id")
            .eq("admin_id", adminId)
            .maybeSingle();
          if (!collision) break;
          adminId = generateAdminId(new_role);
        }
        updatePayload.admin_id = adminId;
      } else {
        // admin_id exists — validate prefix matches new role
        if (!validateAdminIdPrefix(target.admin_id, new_role)) {
          return NextResponse.json(
            { error: `Existing Admin ID ${target.admin_id} does not match role ${new_role}. admin_id is immutable — assign the matching role or create a new admin.` },
            { status: 400 },
          );
        }
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(updatePayload)
      .eq("user_id", target_user_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "set_role",
      target_user: target_user_id,
      metadata: { previous_role: target.role, new_role },
      severity: "critical",
    });

    return NextResponse.json({ ok: true, target_user_id, new_role, admin_id: updatePayload.admin_id ?? target.admin_id });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: owner only" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
