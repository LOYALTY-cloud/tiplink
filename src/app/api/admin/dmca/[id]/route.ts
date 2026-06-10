import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import {
  sendDmcaReviewingEmail,
  sendDmcaResolvedEmail,
  sendDmcaRejectedEmail,
} from "@/lib/dmcaEmails";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("dmca_reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Generate signed URLs for evidence files (private bucket, 1-hour expiry)
    const evidenceSignedUrls: string[] = [];
    for (const path of (data.evidence_urls ?? []) as string[]) {
      const { data: signed } = await supabaseAdmin.storage
        .from("dmca-evidence")
        .createSignedUrl(path, 3600);
      if (signed?.signedUrl) evidenceSignedUrls.push(signed.signedUrl);
    }

    // Fetch audit log for this report (most recent 50)
    const { data: auditLogs } = await supabaseAdmin
      .from("dmca_audit_logs")
      .select("id, admin_id, action, changes, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ report: { ...data, evidence_signed_urls: evidenceSignedUrls }, auditLogs: auditLogs ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const VALID_STATUSES   = ["pending", "reviewing", "resolved", "rejected"];
    const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

    const update: Record<string, unknown> = {};

    if (body.status   && VALID_STATUSES.includes(body.status))     update.status   = body.status;
    if (body.priority && VALID_PRIORITIES.includes(body.priority)) update.priority = body.priority;
    if (body.moderator_notes !== undefined) {
      update.moderator_notes = String(body.moderator_notes).trim() || null;
    }

    // Stamp reviewer when moving out of pending
    if (update.status && update.status !== "pending") {
      update.reviewed_by  = session.userId;
      update.reviewed_at  = new Date().toISOString();
    }

    // Fetch report before updating so we have complainant details for emails
    // and old values for the audit log
    let reportForEmail: { email: string; first_name: string; infringing_content_url: string; status: string; priority: string; moderator_notes: string | null; full_name: string | null; company: string | null; description: string | null; copyright_proof: string | null; electronic_signature: string | null; created_at: string | null } | null = null;
    if (update.status && ["reviewing", "resolved", "rejected"].includes(update.status as string)) {
      const { data: existing } = await supabaseAdmin
        .from("dmca_reports")
        .select("email, first_name, infringing_content_url, status, priority, moderator_notes, full_name, company, description, copyright_proof, electronic_signature, created_at")
        .eq("id", id)
        .maybeSingle();
      reportForEmail = existing;
    } else if (Object.keys(update).length > 0) {
      const { data: existing } = await supabaseAdmin
        .from("dmca_reports")
        .select("status, priority, moderator_notes")
        .eq("id", id)
        .maybeSingle();
      if (existing) reportForEmail = { ...existing, email: "", first_name: "", infringing_content_url: "", full_name: null, company: null, description: null, copyright_proof: null, electronic_signature: null, created_at: null };
    }

    const { error } = await supabaseAdmin
      .from("dmca_reports")
      .update(update)
      .eq("id", id);

    if (error) return NextResponse.json({ error: "Failed to update." }, { status: 500 });

    // Write audit log entries (fire-and-forget, never fail the request)
    try {
      const auditChanges: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];
      if (update.status    !== undefined && reportForEmail) auditChanges.push({ field: "status",          old_value: reportForEmail.status,          new_value: update.status });
      if (update.priority  !== undefined && reportForEmail) auditChanges.push({ field: "priority",        old_value: reportForEmail.priority,        new_value: update.priority });
      if (update.moderator_notes !== undefined && reportForEmail) auditChanges.push({ field: "moderator_notes", old_value: reportForEmail.moderator_notes, new_value: update.moderator_notes });
      if (auditChanges.length > 0) {
        await supabaseAdmin.from("dmca_audit_logs").insert(
          auditChanges.map((c) => ({
            report_id:  id,
            admin_id:   session.userId,
            action:     c.field === "status" ? "status_change" : c.field === "priority" ? "priority_change" : "notes_update",
            changes:    c,
          }))
        );
      }
    } catch (auditErr) {
      console.error("[dmca audit]", auditErr);
    }

    // Send status-change email to complainant (fire-and-forget)
    if (reportForEmail && update.status) {
      const baseOpts = {
        to: reportForEmail.email,
        firstName: reportForEmail.first_name,
        reportId: id,
        infringingUrl: reportForEmail.infringing_content_url,
        moderatorNotes: typeof update.moderator_notes === "string" ? update.moderator_notes : (reportForEmail.moderator_notes ?? undefined),
      };
      const submissionOpts = {
        claimantName: reportForEmail.full_name,
        company: reportForEmail.company,
        description: reportForEmail.description,
        copyrightProof: reportForEmail.copyright_proof,
        signature: reportForEmail.electronic_signature,
        submittedAt: reportForEmail.created_at,
      };
      if (update.status === "reviewing")  sendDmcaReviewingEmail(baseOpts);
      if (update.status === "resolved")   sendDmcaResolvedEmail({ ...baseOpts, ...submissionOpts });
      if (update.status === "rejected")   sendDmcaRejectedEmail({ ...baseOpts, ...submissionOpts });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
