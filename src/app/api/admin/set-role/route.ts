import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

const ASSIGNABLE_ROLES = [
  "super_admin",
  "finance_admin",
  "support_admin",
  "user",
];

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = await getAdminFromSession(jwt);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only owner can assign roles
    requireRole(session.role, ["owner"]);

    const { target_user_id, new_role } = await req.json();

    if (!target_user_id || typeof target_user_id !== "string") {
      return NextResponse.json({ error: "Missing target_user_id" }, { status: 400 });
    }
    if (!ASSIGNABLE_ROLES.includes(new_role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify target user exists
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, user_id")
      .eq("id", target_user_id)
      .maybeSingle();

    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

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

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ role: new_role })
      .eq("id", target_user_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "set_role",
      target_user: target_user_id,
      metadata: { previous_role: target.role, new_role },
      severity: "critical",
    });

    return NextResponse.json({ ok: true, target_user_id, new_role });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden: owner only" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
