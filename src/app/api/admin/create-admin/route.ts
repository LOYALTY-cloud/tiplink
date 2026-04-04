import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { generateAdminId, generateAdminPasscode, validateAdminIdPrefix } from "@/lib/auth/generateAdminId";
import { resend } from "@/lib/email";

export const runtime = "nodejs";

const ADMIN_ROLES = ["owner", "super_admin", "finance_admin", "support_admin"];

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only owner and super_admin can provision admins
    requireRole(session.role, ["owner", "super_admin"]);

    const body = await req.json();
    const { firstName, lastName, email, role, targetUserId } = body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !role) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (!ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Cannot create owner accounts unless you are the owner
    if (role === "owner" && session.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can create owner accounts" }, { status: 403 });
    }

    const displayName = `${firstName.trim()} ${lastName.trim()}`;
    const roleName = role === "owner" ? "Owner" : role === "super_admin" ? "Super Admin" : role === "finance_admin" ? "Finance Admin" : "Support Agent";

    // Generate unique admin ID (retry on collision)
    let adminId = generateAdminId(role);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: collision } = await supabaseAdmin
        .from("profiles")
        .select("admin_id")
        .eq("admin_id", adminId)
        .maybeSingle();
      if (!collision) break;
      adminId = generateAdminId(role);
    }

    // Generate a separate passcode for login (admin_id + extra random chars)
    const adminPasscode = generateAdminPasscode(adminId);

    let userId: string;

    // ── Assign role to existing user ──
    if (targetUserId) {
      const { data: target, error: targetErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, role, admin_id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (targetErr || !target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      if (target.role === "owner" && session.role !== "owner") {
        return NextResponse.json({ error: "Cannot change another owner's role" }, { status: 403 });
      }

      userId = target.user_id;
      // admin_id is immutable once assigned — never overwrite
      if (target.admin_id) {
        adminId = target.admin_id;
        // Validate existing admin_id prefix still matches the new role
        if (!validateAdminIdPrefix(adminId, role)) {
          return NextResponse.json(
            { error: `Existing Admin ID ${adminId} does not match role ${role}. admin_id is immutable — assign the matching role or create a new admin.` },
            { status: 400 },
          );
        }
      }

      const { error: updateErr } = await supabaseAdmin.from("profiles").update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        display_name: displayName,
        email: email.trim().toLowerCase(),
        role,
        admin_id: adminId,
        admin_passcode: adminPasscode,
        invite_status: target.admin_id ? undefined : "pending",
      }).eq("user_id", targetUserId);

      if (updateErr) {
        return NextResponse.json({ error: "Failed to update profile: " + updateErr.message }, { status: 500 });
      }

    // ── Create brand-new admin user ──
    } else {
      // Check if email already has a profile
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }

      const tempPassword = crypto.randomUUID();
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: tempPassword,
        email_confirm: true,
      });

      if (authErr || !authData.user) {
        return NextResponse.json({ error: authErr?.message ?? "Failed to create auth user" }, { status: 500 });
      }

      userId = authData.user.id;

      const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
        user_id: userId,
        handle: userId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        display_name: displayName,
        email: email.trim().toLowerCase(),
        role,
        admin_id: adminId,
        admin_passcode: adminPasscode,
        account_status: "active",
        invite_status: "pending",
        is_active: true,
      }, { onConflict: "user_id" });

      if (profileErr) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: "Failed to create profile: " + profileErr.message }, { status: 500 });
      }
    }

    // Sync to admins table (identity + status control)
    const adminsRole = role === "owner" ? "owner" : "admin";
    await supabaseAdmin.from("admins").upsert({
      user_id: userId,
      full_name: displayName,
      role: adminsRole,
      status: "active",
    }, { onConflict: "user_id" }).then(() => {}, () => {});

    // Generate password reset link for login
    const { data: resetData } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email.trim().toLowerCase(),
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/login`,
      },
    });

    const loginLink = resetData?.properties?.action_link ?? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/login`;

    const from = process.env.RECEIPTS_FROM_EMAIL;
    if (from) {
      await resend.emails.send({
        from,
        to: email.trim().toLowerCase(),
        subject: "Welcome to 1neLink Administration",
        html: `
        <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
          <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
            <div style="text-align:center;margin-bottom:16px;"><img src="https://1nelink.com/1nelink-logo.png" alt="1neLink" width="60" height="60" style="border-radius:14px;" /></div>
            <h2 style="margin:0;color:#111827;">Welcome to 1neLink</h2>
            <p style="margin:10px 0 18px;color:#4b5563;">
              You've been added to the <strong>${roleName}</strong> team.
            </p>

            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
              <p style="margin:0;color:#111827;"><strong>Name:</strong> ${displayName}</p>
              <p style="margin:10px 0 0;color:#111827;"><strong>Admin ID:</strong> ${adminId}</p>
              <p style="margin:10px 0 0;color:#111827;"><strong>Passcode:</strong> ${adminPasscode}</p>
              <p style="margin:10px 0 0;color:#111827;"><strong>Role:</strong> ${roleName}</p>
            </div>

            <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">
              Use your <strong>first name</strong>, <strong>last name</strong>, and <strong>passcode</strong> to log in. Keep your passcode private.
            </p>

            <div style="margin:20px 0;">
              <a href="${loginLink}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
                Set Password &amp; Login
              </a>
            </div>

            <p style="margin:0;color:#9ca3af;font-size:12px;">
              If you did not expect this email, you can safely ignore it.
            </p>
          </div>
        </div>`,
      }).catch(() => {});
    }

    // Log admin action with full context
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "create_admin",
      severity: "critical",
      target_user: userId,
      metadata: {
        display_name: displayName,
        target_admin_id: adminId,
        role_assigned: role,
        mode: targetUserId ? "assign" : "new",
      },
    }).then(() => {}, () => {});

    return NextResponse.json({
      success: true,
      user_id: userId,
      admin_id: adminId,
      admin_passcode: adminPasscode,
      display_name: displayName,
      role,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
