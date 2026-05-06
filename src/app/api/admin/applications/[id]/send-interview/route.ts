import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { getResend } from "@/lib/email";
import { emailFooter } from "@/lib/email/footer";

export const runtime = "nodejs";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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

  let body: { scheduling_link?: unknown; meeting_link?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // scheduling_link = Calendly URL sent to candidate
  // meeting_link    = Zoom/Meet link saved to application (optional)
  const schedulingLink = typeof body.scheduling_link === "string" ? body.scheduling_link.trim() : "";
  if (!schedulingLink) {
    return NextResponse.json({ error: "scheduling_link is required." }, { status: 422 });
  }
  if (!schedulingLink.startsWith("https://")) {
    return NextResponse.json({ error: "scheduling_link must be a valid https:// URL." }, { status: 422 });
  }

  const { data: app, error: fetchError } = await supabaseAdmin
    .from("applications")
    .select("name, email, role")
    .eq("id", id)
    .single();

  if (fetchError || !app) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const from = process.env.EMAIL_FROM || "1neLink <noreply@1nelink.com>";
  const firstName = escHtml(app.name.split(" ")[0]);

  const html = `
    <div style="font-family:sans-serif;background:#050A1A;padding:40px 24px;min-height:100vh;">
      <div style="max-width:560px;margin:0 auto;background:#0D1426;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;">

        <!-- Header -->
        <div style="margin-bottom:32px;">
          <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:4px;">1neLink</div>
          <div style="width:40px;height:3px;background:#3B82F6;border-radius:2px;"></div>
        </div>

        <!-- Body -->
        <p style="font-size:15px;color:#e5e7eb;margin:0 0 16px;">Hi ${firstName},</p>
        <p style="font-size:15px;color:#e5e7eb;margin:0 0 16px;">
          Thank you for applying for the <strong style="color:#ffffff;">${app.role}</strong> position at 1neLink.
          We've reviewed your application and we'd love to schedule a time to connect.
        </p>
        <p style="font-size:15px;color:#e5e7eb;margin:0 0 32px;">
          Please use the link below to choose a time that works best for you:
        </p>

        <!-- CTA Button -->
        <div style="text-align:center;margin-bottom:32px;">
          <a href="${schedulingLink}"
            style="display:inline-block;background:#3B82F6;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
            Schedule Your Interview →
          </a>
        </div>

        <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="font-size:13px;color:#3B82F6;word-break:break-all;margin:0 0 32px;">
          ${schedulingLink}
        </p>

        <p style="font-size:14px;color:#9ca3af;margin:0;">
          We look forward to speaking with you.<br/>
          <strong style="color:#e5e7eb;">The 1neLink Team</strong>
        </p>

        ${emailFooter()}
      </div>
    </div>
  `;

  try {
    const resend = getResend();
    await resend.emails.send({
      from,
      to: app.email,
      subject: `Schedule your interview at 1neLink – ${app.role}`,
      html,
    });
  } catch (err) {
    console.error("send-interview email error:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }

  // Optionally save meeting link if provided
  if (typeof body.meeting_link === "string" && body.meeting_link.trim()) {
    await supabaseAdmin
      .from("applications")
      .update({ interview_link: body.meeting_link.trim() })
      .eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
