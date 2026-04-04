import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ADMIN_ROLES = ["owner", "super_admin", "finance_admin", "support_admin"];

export async function POST(req: Request) {
  try {
    const { firstName, lastName, passcode } = await req.json();

    if (!firstName?.trim() || !lastName?.trim() || !passcode?.trim()) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const fn = firstName.trim().toLowerCase();
    const ln = lastName.trim().toLowerCase();
    const code = passcode.trim().toUpperCase();

    // Look up profile by admin_passcode
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role, admin_id, admin_passcode, email, is_active, invite_status")
      .eq("admin_passcode", code)
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify name matches (case-insensitive)
    const dbFirst = (profile.first_name ?? "").toLowerCase();
    const dbLast = (profile.last_name ?? "").toLowerCase();
    if (dbFirst !== fn || dbLast !== ln) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify admin role
    if (!profile.role || !ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Check if admin account is deactivated
    if (profile.is_active === false) {
      return NextResponse.json({ error: "Account deactivated. Contact the owner." }, { status: 403 });
    }

    // Check admins table status (suspended / terminated / restricted)
    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("status, restricted_until")
      .eq("user_id", profile.user_id)
      .maybeSingle();

    if (adminRow) {
      if (adminRow.status === "terminated") {
        return NextResponse.json({ error: "Your admin access has been permanently revoked." }, { status: 403 });
      }
      if (adminRow.status === "suspended") {
        return NextResponse.json({ error: "Your admin account is suspended. Contact the owner." }, { status: 403 });
      }
      // Update last_login_at on the admins table
      await supabaseAdmin
        .from("admins")
        .update({ last_login_at: new Date().toISOString() })
        .eq("user_id", profile.user_id)
        .then(() => {}, () => {});
    }

    // Mark invite as accepted on first login
    if (profile.invite_status === "pending") {
      await supabaseAdmin.from("profiles").update({ invite_status: "accepted" }).eq("admin_passcode", code).then(() => {}, () => {});
    }

    // Update last_active_at on login + set online
    await supabaseAdmin
      .from("profiles")
      .update({ last_active_at: new Date().toISOString(), availability: "online" })
      .eq("admin_passcode", code)
      .then(() => {}, () => {});

    // Log the login
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: profile.user_id,
      action: "admin_login",
      severity: "info",
      metadata: {
        display_name: profile.display_name,
        admin_id_used: profile.admin_id,
      },
    }).then(() => {}, () => {});

    return NextResponse.json({
      ok: true,
      session: {
        id: profile.user_id,
        name: profile.first_name && profile.last_name
          ? `${profile.first_name} ${profile.last_name}`
          : profile.display_name || `${firstName.trim()} ${lastName.trim()}`,
        role: profile.role,
        admin_id: profile.admin_id,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
