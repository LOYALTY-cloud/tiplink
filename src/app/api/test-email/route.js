import { Resend } from "resend";

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "no-reply@1nelink.com";
  const to = "money2loyal@gmail.com";

  if (!apiKey) {
    return Response.json({ error: "Missing RESEND_API_KEY" }, { status: 500 });
  }

  const resend = new Resend(apiKey);
  const results = [];

  // 1. Ticket Created — confirmation email
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject: "Ticket received: Payment not showing up",
      html: buildSupportEmail(
        "Ticket received: Payment not showing up",
        "We've received your support ticket and will get back to you soon. Ticket #a1b2c3d4.",
        "abc-ticket-123"
      ),
    });
    results.push({ type: "ticket_created", status: "sent", id: r.data?.id });
  } catch (e) {
    results.push({ type: "ticket_created", status: "failed", error: e.message });
  }

  // 2. Admin Reply — user gets notified
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject: "Reply on: Payment not showing up",
      html: buildSupportEmail(
        "Reply on: Payment not showing up",
        "Hi! I've looked into your account and the payment is currently processing. It should appear in your wallet within the next few minutes. Let me know if you still don't see it.",
        "abc-ticket-123"
      ),
    });
    results.push({ type: "admin_reply", status: "sent", id: r.data?.id });
  } catch (e) {
    results.push({ type: "admin_reply", status: "failed", error: e.message });
  }

  // 3. Ticket Resolved
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject: "Ticket resolved: Payment not showing up",
      html: buildSupportEmail(
        "Ticket resolved: Payment not showing up",
        "Your support ticket has been resolved. If you still need help, you can reply to reopen it.",
        "abc-ticket-123"
      ),
    });
    results.push({ type: "ticket_resolved", status: "sent", id: r.data?.id });
  } catch (e) {
    results.push({ type: "ticket_resolved", status: "failed", error: e.message });
  }

  // 4. Ticket Closed (inactivity)
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject: "Ticket closed: Payment not showing up",
      html: buildSupportEmail(
        "Ticket closed: Payment not showing up",
        "Your support ticket was automatically closed due to inactivity. If you still need help, please open a new ticket.",
        "abc-ticket-123"
      ),
    });
    results.push({ type: "ticket_auto_closed", status: "sent", id: r.data?.id });
  } catch (e) {
    results.push({ type: "ticket_auto_closed", status: "failed", error: e.message });
  }

  // 5. Auto-close warning
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject: "Action needed: Payment not showing up",
      html: buildSupportEmail(
        "Action needed: Payment not showing up",
        "We haven't heard from you in a while. This ticket will be automatically closed in 24 hours if no reply is received.",
        "abc-ticket-123"
      ),
    });
    results.push({ type: "auto_close_warning", status: "sent", id: r.data?.id });
  } catch (e) {
    results.push({ type: "auto_close_warning", status: "failed", error: e.message });
  }

  // 6. Nudge reminder (24h)
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject: "Reminder: Payment not showing up",
      html: buildSupportEmail(
        "Reminder: Payment not showing up",
        "We're waiting for your reply. Please respond so we can continue helping you.",
        "abc-ticket-123"
      ),
    });
    results.push({ type: "nudge_reminder", status: "sent", id: r.data?.id });
  } catch (e) {
    results.push({ type: "nudge_reminder", status: "failed", error: e.message });
  }

  // 7. Live support session ended
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject: "Support session ended",
      html: buildSupportEmail(
        "Support session ended",
        "Your live support session has ended. If you need further help, you can start a new chat or submit a ticket from your Dashboard → Support.",
        null
      ),
    });
    results.push({ type: "live_support_ended", status: "sent", id: r.data?.id });
  } catch (e) {
    results.push({ type: "live_support_ended", status: "failed", error: e.message });
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return Response.json({
    summary: `${sent} sent, ${failed} failed out of ${results.length} emails`,
    results,
  });
}

function buildSupportEmail(title, body, ticketId) {
  const dashUrl = "https://1nelink.com/dashboard";
  const ctaHref = ticketId
    ? `${dashUrl}/support/tickets/${ticketId}`
    : `${dashUrl}/support`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="text-align:center;margin-bottom:16px;"><img src="https://1nelink.com/1nelink-logo.png" alt="1neLink" width="60" height="60" style="border-radius:14px;" /></div>
      <p style="margin:16px 0 8px;font-size:20px;color:#111827;font-weight:700;">${title}</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:12px 0;">
        <p style="margin:0;color:#1e40af;">${body}</p>
        ${ticketId ? `<p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Ticket #${ticketId.slice(0, 8)}</p>` : ""}
      </div>
      <a href="${ctaHref}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        View Ticket →
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You can manage notification preferences in your
        <a href="${dashUrl}" style="color:#6b7280;">Settings</a>.
      </p>
    </div>
  </div>`;
}
