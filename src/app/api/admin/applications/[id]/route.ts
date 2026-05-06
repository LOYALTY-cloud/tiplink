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

const VALID_STATUSES = new Set(["applied", "reviewing", "interview", "offer", "hired", "rejected"]);

type StatusEmailConfig = {
  subject: string;
  title: string;
  body: (name: string, role: string) => string;
  accent: string;
};

const STATUS_EMAILS: Partial<Record<string, StatusEmailConfig>> = {
  reviewing: {
    subject: "Your application is under review – 1neLink",
    title: "Application Under Review",
    body: (name, role) =>
      `Hi ${name.split(" ")[0]},<br/><br/>
       Great news — your application for <strong>${role}</strong> at 1neLink is now being reviewed by our team.
       We'll be in touch with next steps soon.`,
    accent: "#3B82F6",
  },
  interview: {
    subject: "You've been selected for an interview – 1neLink",
    title: "Interview Invitation",
    body: (name, role) =>
      `Hi ${name.split(" ")[0]},<br/><br/>
       We're excited to move you forward for the <strong>${role}</strong> position at 1neLink.
       A member of our team will reach out shortly to coordinate scheduling.`,
    accent: "#F59E0B",
  },
  offer: {
    subject: "We have an offer for you – 1neLink",
    title: "Job Offer",
    body: (name, role) =>
      `Hi ${name.split(" ")[0]},<br/><br/>
       We're thrilled to extend an offer for the <strong>${role}</strong> position at 1neLink.
       Our team will send you the formal offer details shortly. Congratulations!`,
    accent: "#A855F7",
  },
  hired: {
    subject: "Welcome to 1neLink! 🎉",
    title: "Welcome to the Team",
    body: (name, role) =>
      `Hi ${name.split(" ")[0]},<br/><br/>
       We are beyond excited to officially welcome you to 1neLink as our new <strong>${role}</strong>.
       You'll receive onboarding details from our team very soon. Welcome aboard!`,
    accent: "#22C55E",
  },
  rejected: {
    subject: "Your 1neLink application – update",
    title: "Application Update",
    body: (name, role) =>
      `Hi ${name.split(" ")[0]},<br/><br/>
       Thank you for taking the time to apply for <strong>${role}</strong> at 1neLink.
       After careful consideration, we have decided not to move forward with your application at this time.
       We genuinely appreciate your interest and encourage you to apply again in the future.`,
    accent: "#EF4444",
  },
};

async function sendStatusEmail(
  toEmail: string,
  name: string,
  role: string,
  status: string,
) {
  const cfg = STATUS_EMAILS[status];
  if (!cfg) return; // no email for this status

  const safeName = escHtml(name);
  const safeRole = escHtml(role);
  const from = process.env.EMAIL_FROM || "1neLink <noreply@1nelink.com>";
  const html = `
    <div style="font-family:sans-serif;background:#050A1A;padding:40px 24px;">
      <div style="max-width:540px;margin:0 auto;background:#0D1426;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;">
        <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:4px;">1neLink</div>
        <div style="width:40px;height:3px;background:${cfg.accent};border-radius:2px;margin-bottom:28px;"></div>
        <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 20px;">${cfg.title}</h2>
        <p style="font-size:15px;color:#d1d5db;line-height:1.6;margin:0 0 28px;">${cfg.body(safeName, safeRole)}</p>
        <p style="font-size:13px;color:#6b7280;">
          Best regards,<br/><strong style="color:#e5e7eb;">The 1neLink Hiring Team</strong>
        </p>
        ${emailFooter()}
      </div>
    </div>
  `;

  const resend = getResend();
  await resend.emails.send({ from, to: toEmail, subject: cfg.subject, html });
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status } = body;

  if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status value." }, { status: 422 });
  }

  const { error } = await supabaseAdmin
    .from("applications")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("admin applications PATCH error:", error.message);
    return NextResponse.json({ error: "Failed to update application." }, { status: 500 });
  }

  // Send status-change email async (don't block response on failure)
  if (STATUS_EMAILS[status]) {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("name, email, role")
      .eq("id", id)
      .single();

    if (app) {
      sendStatusEmail(app.email, app.name, app.role, status).catch((err) =>
        console.error(`status email failed for ${id} → ${status}:`, err)
      );
    }
  }

  return NextResponse.json({ ok: true });
}
