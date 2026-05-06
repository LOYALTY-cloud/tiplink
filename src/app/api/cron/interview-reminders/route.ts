import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getResend } from "@/lib/email";
import { emailFooter } from "@/lib/email/footer";
import { addMinutes } from "date-fns";

export const runtime = "nodejs";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Cron: send interview reminders 30 min before scheduled time.
 * GET /api/cron/interview-reminders?key=CRON_SECRET
 * Runs every 10 minutes via Vercel Cron.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now  = new Date();
  const soon = addMinutes(now, 30);

  // Find interviews in the next 30 min that haven't been reminded yet
  const { data: upcoming, error } = await supabaseAdmin
    .from("interviews")
    .select("id, date, type, meeting_link, candidate_name, candidate_email, reminded_at, applications(name, email, role)")
    .gte("date", now.toISOString())
    .lte("date", soon.toISOString())
    .is("reminded_at", null);

  if (error) {
    console.error("interview-reminders cron error:", error.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!upcoming || upcoming.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const from   = process.env.EMAIL_FROM || "1neLink <noreply@1nelink.com>";
  let sent = 0;

  for (const interview of upcoming) {
    // Resolve candidate contact — prefer denormalised columns, fall back to joined application
    const app = Array.isArray(interview.applications)
      ? interview.applications[0]
      : interview.applications;

    const name  = interview.candidate_name  || (app as { name?: string })?.name  || "Candidate";
    const email = interview.candidate_email || (app as { email?: string })?.email;
    const role  = (app as { role?: string })?.role || "your position";

    if (!email) continue;

    const dateStr = new Date(interview.date).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });

    const safeName  = escHtml(name.split(" ")[0]);
    const safeRole  = escHtml(role);
    const safeDate  = escHtml(dateStr);
    const safeType  = escHtml(interview.type || "zoom");
    const safeLink  = interview.meeting_link ? encodeURI(interview.meeting_link) : null;

    const html = `
      <div style="font-family:sans-serif;background:#050A1A;padding:40px 24px;">
        <div style="max-width:520px;margin:0 auto;background:#0D1426;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;">
          <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:4px;">1neLink</div>
          <div style="width:40px;height:3px;background:#F59E0B;border-radius:2px;margin-bottom:28px;"></div>

          <p style="font-size:15px;color:#e5e7eb;margin:0 0 12px;">Hi ${safeName},</p>
          <p style="font-size:15px;color:#e5e7eb;margin:0 0 20px;">
            Just a reminder &mdash; your interview for the <strong style="color:#fff;">${safeRole}</strong> position
            at 1neLink is starting <strong style="color:#F59E0B;">soon</strong>.
          </p>

          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:16px;margin-bottom:28px;">
            <p style="margin:0;font-size:14px;color:#fde68a;">&#128197; ${safeDate}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;text-transform:capitalize;">Format: ${safeType}</p>
          </div>

          ${safeLink ? `
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${safeLink}"
              style="display:inline-block;background:#3B82F6;color:#fff;font-size:14px;font-weight:600;padding:13px 28px;border-radius:10px;text-decoration:none;">
              Join Interview &rarr;
            </a>
          </div>` : ""}

          <p style="font-size:13px;color:#6b7280;margin:0;">
            Good luck!<br/><strong style="color:#e5e7eb;">The 1neLink Team</strong>
          </p>
          ${emailFooter()}
        </div>
      </div>
    `;

    try {
      const resend = getResend();
      await resend.emails.send({
        from,
        to: email,
        subject: "Interview Reminder – starting soon",
        html,
      });

      // Mark reminded
      await supabaseAdmin
        .from("interviews")
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", interview.id);

      sent++;
    } catch (err) {
      console.error(`reminder email failed for interview ${interview.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
