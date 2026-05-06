import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

const VALID_TYPES = new Set(["zoom", "phone", "in-person"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { date?: unknown; type?: unknown; notes?: unknown; interview_link?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!date) return NextResponse.json({ error: "Interview date is required." }, { status: 422 });
  if (isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 422 });
  }

  const type = typeof body.type === "string" && VALID_TYPES.has(body.type) ? body.type : "zoom";
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  const interviewLink = typeof body.interview_link === "string" ? body.interview_link.trim() : "";
  if (interviewLink && !interviewLink.startsWith("https://")) {
    return NextResponse.json({ error: "Meeting link must be a valid https:// URL." }, { status: 422 });
  }

  // Fetch application to denormalize candidate identity on the interview record
  const { data: appData } = await supabaseAdmin
    .from("applications")
    .select("name, email")
    .eq("id", id)
    .single();

  const { data, error } = await supabaseAdmin
    .from("interviews")
    .insert({
      application_id: id,
      date,
      type,
      notes,
      candidate_name:  appData?.name  ?? null,
      candidate_email: appData?.email ?? null,
      ...(interviewLink ? { meeting_link: interviewLink } : {}),
    })
    .select("id, date, type")
    .single();

  if (error) {
    console.error("interview POST error:", error.message);
    return NextResponse.json({ error: "Failed to schedule interview." }, { status: 500 });
  }

  // Move application to interview stage and optionally save meeting link
  const appUpdate: Record<string, unknown> = { status: "interview" };
  if (interviewLink) {
    appUpdate.interview_link = interviewLink;
  }
  await supabaseAdmin.from("applications").update(appUpdate).eq("id", id);

  return NextResponse.json(data);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { interview_link?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const link = typeof body.interview_link === "string" ? body.interview_link.trim() : "";
  if (link && !link.startsWith("https://")) {
    return NextResponse.json({ error: "Meeting link must be a valid https:// URL." }, { status: 422 });
  }

  const { error } = await supabaseAdmin
    .from("applications")
    .update({ interview_link: link || null })
    .eq("id", id);

  if (error) {
    console.error("interview PATCH error:", error.message);
    return NextResponse.json({ error: "Failed to save link." }, { status: 500 });
  }

  // Also sync meeting_link on the most recently created interview for this application
  const { data: latest } = await supabaseAdmin
    .from("interviews")
    .select("id")
    .eq("application_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) {
    await supabaseAdmin
      .from("interviews")
      .update({ meeting_link: link || null })
      .eq("id", latest.id);
  }

  return NextResponse.json({ ok: true });
}
