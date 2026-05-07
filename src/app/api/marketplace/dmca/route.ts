import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: {
    claimantName?: string;
    email?: string;
    company?: string;
    themeUrl?: string;
    copyrightProof?: string;
    description?: string;
    signature?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { claimantName, email, company, themeUrl, copyrightProof, description, signature } = body;

  if (!claimantName?.trim()) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  if (!email?.trim() || !EMAIL_RE.test(email.trim())) return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  if (!description?.trim()) return NextResponse.json({ error: "Description of infringement is required." }, { status: 400 });
  if (!signature?.trim()) return NextResponse.json({ error: "Electronic signature is required." }, { status: 400 });

  // Resolve theme_id from URL if provided
  let themeId: string | null = null;
  if (themeUrl?.trim()) {
    // Extract slug or UUID from URL — try to find a matching theme
    const urlStr = themeUrl.trim();
    const uuidMatch = urlStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      const { data } = await supabaseAdmin.from("themes").select("id").eq("id", uuidMatch[0]).maybeSingle();
      if (data) themeId = data.id;
    }
  }

  const { error } = await supabaseAdmin.from("dmca_claims").insert({
    theme_id: themeId,
    claimant_name: claimantName.trim().slice(0, 120),
    email: email.trim().slice(0, 200),
    company: company?.trim().slice(0, 120) || null,
    copyright_proof: copyrightProof?.trim().slice(0, 1000) || null,
    description: description.trim().slice(0, 2000),
    signature: signature.trim().slice(0, 120),
  });

  if (error) {
    return NextResponse.json({ error: "Failed to submit DMCA claim." }, { status: 500 });
  }

  // If we could identify the theme, auto-flag it as pending review
  if (themeId) {
    await supabaseAdmin
      .from("themes")
      .update({ status: "flagged", moderation_reason: "DMCA claim filed" })
      .eq("id", themeId)
      .in("status", ["approved", "pending_review", "draft"]);
  }

  return NextResponse.json({ ok: true });
}
