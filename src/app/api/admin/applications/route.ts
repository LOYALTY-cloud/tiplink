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

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, name, email, phone, role, portfolio, linkedin, salary, years_experience, experience, system_built, why, why_role, company_mission, school, degree, discipline, additional_profiles, previously_employed, professional_references, status, resume_url, cover_letter_url, interview_link, ai_score, ai_summary, risk_score, risk_flags, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("admin applications GET error:", error.message);
    return NextResponse.json({ error: "Failed to load applications." }, { status: 500 });
  }

  return NextResponse.json(data);
}
