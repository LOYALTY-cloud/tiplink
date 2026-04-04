import { NextResponse } from "next/server";
import { resend } from "@/lib/email";

export const runtime = "nodejs";

const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

/**
 * GET /api/test/email?to=you@example.com
 * Sends all 5 support notification email templates as test emails.
 * Disabled in production.
 */
export async function GET(req: Request) {
  if (IS_PROD) return NextResponse.json({ error: "Not available" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to");

  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Pass ?to=your@email.com" }, { status: 400 });
  }

  const from = process.env.EMAIL_FROM!;
  const ticketId = "test1234-5678-abcd-efgh";
  const dashboardUrl = "https://1nelink.com/dashboard";
  const ticketUrl = `${dashboardUrl}/support/tickets/${ticketId}`;

  const emails = [
    {
      label: "1. Ticket Created (confirmation)",
      subject: "Ticket received: My withdrawal is stuck",
      html: buildSupportEmail({
        title: "Ticket received: My withdrawal is stuck",
        body: "We've received your support ticket and will get back to you soon. Ticket #test1234.",
        ticketUrl,
      }),
    },
    {
      label: "2. Admin Reply",
      subject: "Reply on: My withdrawal is stuck",
      html: buildSupportEmail({
        title: "Reply on: My withdrawal is stuck",
        body: "Hi there! I looked into your account and can see the withdrawal is processing. It should arrive within 1-2 business days. Let me know if you need anything else.",
        ticketUrl,
      }),
    },
    {
      label: "3. Ticket Resolved",
      subject: "Ticket resolved: My withdrawal is stuck",
      html: buildSupportEmail({
        title: "Ticket resolved: My withdrawal is stuck",
        body: "Your support ticket has been resolved. If you still need help, you can reply to reopen it.",
        ticketUrl,
      }),
    },
    {
      label: "4. Auto-close Warning",
      subject: "Action needed: My withdrawal is stuck",
      html: buildSupportEmail({
        title: "Action needed: My withdrawal is stuck",
        body: "We haven't heard from you in a while. This ticket will be automatically closed in 24 hours if no reply is received.",
        ticketUrl,
      }),
    },
    {
      label: "5. Ticket Closed (inactivity)",
      subject: "Ticket closed: My withdrawal is stuck",
      html: buildSupportEmail({
        title: "Ticket closed: My withdrawal is stuck",
        body: "Your support ticket was automatically closed due to inactivity. If you still need help, please open a new ticket.",
        ticketUrl,
      }),
    },
  ];

  const results = [];

  for (const email of emails) {
    try {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject: `[TEST] ${email.subject}`,
        html: email.html,
      });
      results.push({
        label: email.label,
        status: error ? "FAILED" : "SENT",
        id: data?.id ?? null,
        error: error?.message ?? null,
      });
    } catch (err: unknown) {
      results.push({
        label: email.label,
        status: "ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ sent_to: to, results });
}

function buildSupportEmail({ title, body, ticketUrl }: { title: string; body: string; ticketUrl: string }): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr><td align="center" style="padding:30px 20px 10px 20px;"><img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="150" style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" /></td></tr><tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr><tr><td height="10"></td></tr></table>
      <p style="margin:16px 0 8px;font-size:20px;color:#111827;font-weight:700;">${title}</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:12px 0;">
        <p style="margin:0;color:#1e40af;">${body}</p>
      </div>
      <a href="${ticketUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        View Ticket →
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You can manage notification preferences in your
        <a href="https://1nelink.com/dashboard" style="color:#6b7280;">Settings</a>.
      </p>
    </div>
  </div>`;
}
