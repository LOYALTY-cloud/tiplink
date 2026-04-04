import { NextResponse } from "next/server";
import { resend } from "@/lib/email";

export const runtime = "nodejs";

const DASHBOARD_URL = "https://1nelink.com/dashboard";

function buildSupportBlock(message: string, meta?: { ticketId?: string }): string {
  return `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:12px 0;">
    <p style="margin:0;color:#1e40af;">${message}</p>
    ${meta?.ticketId ? `<p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Ticket #${meta.ticketId.slice(0, 8)}</p>` : ""}
  </div>`;
}

function buildFullEmail(title: string, inner: string, ctaLabel: string, ctaHref: string, ctaColor: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr><td align="center" style="padding:30px 20px 10px 20px;"><img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="150" style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" /></td></tr><tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr><tr><td height="10"></td></tr></table>
      <p style="margin:16px 0 8px;font-size:20px;color:#111827;font-weight:700;">${title}</p>
      ${inner}
      <a href="${ctaHref}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:${ctaColor};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        ${ctaLabel}
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You can manage notification preferences in your
        <a href="${DASHBOARD_URL}" style="color:#6b7280;">Settings</a>.
      </p>
    </div>
  </div>`;
}

/**
 * POST /api/test/email-notifications
 * Body: { email: "test@example.com" }
 *
 * Sends all 6 support notification email templates to the given address.
 * Admin-only in production.
 */
export async function POST(req: Request) {
  try {
    // Block in production unless admin
    if (process.env.NODE_ENV === "production") {
      const authHeader = req.headers.get("authorization");
      const cronSecret = req.headers.get("x-cron-secret");
      if (cronSecret !== process.env.CRON_SECRET && !authHeader) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const email = body.email;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required in body" }, { status: 400 });
    }

    const from = process.env.EMAIL_FROM!;
    const fakeTicketId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ticketLink = `${DASHBOARD_URL}/support/tickets/${fakeTicketId}`;
    const results: { name: string; ok: boolean; error?: string }[] = [];

    // ── 1. Ticket Received (confirmation on creation) ──
    {
      const title = "Ticket received: My withdrawal is stuck";
      const inner = buildSupportBlock(
        "We've received your support ticket and will get back to you soon. Ticket #a1b2c3d4.",
        { ticketId: fakeTicketId }
      );
      const html = buildFullEmail(title, inner, "View Ticket →", ticketLink, "#111827");
      try {
        await resend.emails.send({ from, to: email, subject: `[TEST] ${title}`, html });
        results.push({ name: "1. Ticket Received", ok: true });
      } catch (e: any) {
        results.push({ name: "1. Ticket Received", ok: false, error: e.message });
      }
    }

    // ── 2. Admin Reply ──
    {
      const title = "Reply on: My withdrawal is stuck";
      const inner = buildSupportBlock(
        "Hi there! I've checked your account and your withdrawal is currently processing. It should arrive within 1-2 business days. Let me know if you have any other questions.",
        { ticketId: fakeTicketId }
      );
      const html = buildFullEmail(title, inner, "View Ticket →", ticketLink, "#111827");
      try {
        await resend.emails.send({ from, to: email, subject: `[TEST] ${title}`, html });
        results.push({ name: "2. Admin Reply", ok: true });
      } catch (e: any) {
        results.push({ name: "2. Admin Reply", ok: false, error: e.message });
      }
    }

    // ── 3. Ticket Resolved ──
    {
      const title = "Ticket resolved: My withdrawal is stuck";
      const inner = buildSupportBlock(
        "Your support ticket has been resolved. If you still need help, you can reply to reopen it.",
        { ticketId: fakeTicketId }
      );
      const html = buildFullEmail(title, inner, "View Ticket →", ticketLink, "#111827");
      try {
        await resend.emails.send({ from, to: email, subject: `[TEST] ${title}`, html });
        results.push({ name: "3. Ticket Resolved", ok: true });
      } catch (e: any) {
        results.push({ name: "3. Ticket Resolved", ok: false, error: e.message });
      }
    }

    // ── 4. Ticket Closed (auto-close) ──
    {
      const title = "Ticket closed: My withdrawal is stuck";
      const inner = buildSupportBlock(
        "Your support ticket was automatically closed due to inactivity. If you still need help, please open a new ticket.",
        { ticketId: fakeTicketId }
      );
      const html = buildFullEmail(title, inner, "View Ticket →", ticketLink, "#111827");
      try {
        await resend.emails.send({ from, to: email, subject: `[TEST] ${title}`, html });
        results.push({ name: "4. Ticket Auto-Closed", ok: true });
      } catch (e: any) {
        results.push({ name: "4. Ticket Auto-Closed", ok: false, error: e.message });
      }
    }

    // ── 5. Auto-Close Warning ──
    {
      const title = "Action needed: My withdrawal is stuck";
      const inner = buildSupportBlock(
        "We haven't heard from you in a while. This ticket will be automatically closed in 24 hours if no reply is received.",
        { ticketId: fakeTicketId }
      );
      const html = buildFullEmail(title, inner, "View Ticket →", ticketLink, "#111827");
      try {
        await resend.emails.send({ from, to: email, subject: `[TEST] ${title}`, html });
        results.push({ name: "5. Auto-Close Warning", ok: true });
      } catch (e: any) {
        results.push({ name: "5. Auto-Close Warning", ok: false, error: e.message });
      }
    }

    // ── 6. Nudge Reminder ──
    {
      const title = "Reminder: My withdrawal is stuck";
      const inner = buildSupportBlock(
        "We're waiting for your reply. Please respond so we can continue helping you.",
        { ticketId: fakeTicketId }
      );
      const html = buildFullEmail(title, inner, "View Ticket →", ticketLink, "#111827");
      try {
        await resend.emails.send({ from, to: email, subject: `[TEST] ${title}`, html });
        results.push({ name: "6. Nudge Reminder", ok: true });
      } catch (e: any) {
        results.push({ name: "6. Nudge Reminder", ok: false, error: e.message });
      }
    }

    const allOk = results.every((r) => r.ok);
    return NextResponse.json({
      success: allOk,
      sent_to: email,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
