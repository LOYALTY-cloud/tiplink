import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  let query = supabaseAdmin
    .from("interviews")
    .select("id, date, type, notes, meeting_link, candidate_name, candidate_email, application_id, applications(name, email, role, status)")
    .order("date", { ascending: true });

  if (from) query = query.gte("date", from);
  if (to)   query = query.lte("date", to);

  const { data, error } = await query;

  if (error) {
    console.error("interviews GET error:", error.message);
    return NextResponse.json({ error: "Failed to load interviews." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
