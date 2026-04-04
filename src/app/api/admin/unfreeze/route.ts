import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    requireRole(session.role, "restrict");

    const { user_id } = await req.json();

    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    // Verify user is actually frozen
    const { data: profile, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("is_frozen, account_status")
      .eq("user_id", user_id)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!profile.is_frozen) {
      return NextResponse.json({ error: "Account is not frozen" }, { status: 400 });
    }

    // Unfreeze the account
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        is_frozen: false,
        freeze_reason: null,
        frozen_at: null,
        account_status: profile.account_status === "restricted" ? "active" : profile.account_status,
      })
      .eq("user_id", user_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Log admin action for audit trail
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "unfreeze_account",
      target_user_id: user_id,
      details: { previous_status: profile.account_status },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
