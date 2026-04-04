import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/** POST — add a support note to a user */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "support_admin"]);

    const { user_id, note } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }
    if (!note || typeof note !== "string" || !note.trim()) {
      return NextResponse.json({ error: "Missing note" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("support_notes").insert({
      user_id,
      admin_id: session.userId,
      note: note.trim(),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

/** GET — list support notes for a user */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("support_notes")
      .select(`
        id,
        note,
        created_at,
        admin:profiles!support_notes_admin_id_fkey (
          display_name,
          handle,
          role
        )
      `)
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ notes: data ?? [] });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
