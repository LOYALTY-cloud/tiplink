import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * POST /api/admin/store/featured
 * Body: { store_id: string, featured: boolean }
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin"]);

    let body: { store_id?: unknown; featured?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (typeof body.store_id !== "string" || !body.store_id.trim()) {
      return NextResponse.json({ error: "store_id is required" }, { status: 400 });
    }

    if (typeof body.featured !== "boolean") {
      return NextResponse.json({ error: "featured boolean is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("creator_stores")
      .update({ featured: body.featured })
      .eq("id", body.store_id);

    if (error) {
      return NextResponse.json({ error: "Failed to update featured status." }, { status: 500 });
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
