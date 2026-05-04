import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** POST — Create a new work session for the authenticated admin. */
export async function POST(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Close any stale open sessions first (e.g. crashed tab)
    await supabaseAdmin
      .from("admin_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("admin_id", admin.userId)
      .is("ended_at", null);

    const { data, error } = await supabaseAdmin
      .from("admin_sessions")
      .insert({ admin_id: admin.userId })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to start session" }, { status: 500 });
    }

    return NextResponse.json({ session_id: data.id });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
