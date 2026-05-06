import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, ["owner", "super_admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("resume_url, cover_letter_url")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const urls: Record<string, string> = {};

  if (data.resume_url) {
    const { data: signed } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(data.resume_url, 3600);
    if (signed?.signedUrl) {
      urls.resume = signed.signedUrl;
      // Separate download URL that triggers browser save-as
      const { data: dl } = await supabaseAdmin.storage
        .from("resumes")
        .createSignedUrl(data.resume_url, 3600, { download: true });
      if (dl?.signedUrl) urls.resume_download = dl.signedUrl;
    }
  }

  if (data.cover_letter_url) {
    const { data: signed } = await supabaseAdmin.storage
      .from("cover_letters")
      .createSignedUrl(data.cover_letter_url, 3600);
    if (signed?.signedUrl) {
      urls.cover_letter = signed.signedUrl;
      const { data: dl } = await supabaseAdmin.storage
        .from("cover_letters")
        .createSignedUrl(data.cover_letter_url, 3600, { download: true });
      if (dl?.signedUrl) urls.cover_letter_download = dl.signedUrl;
    }
  }

  return NextResponse.json(urls);
}
