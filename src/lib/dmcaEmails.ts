/**
 * DMCA / IP Complaint Email Templates
 *
 * Four transactional emails sent to the complainant:
 *   1. SUBMITTED  — confirmation on receipt
 *   2. REVIEWING  — admin has picked up the report
 *   3. RESOLVED   — takedown / action completed
 *   4. REJECTED   — claim could not be actioned
 */

import { sendEmailAsync, type EmailType } from "@/lib/emailService";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://1nelink.com";

// ─── Shared HTML helpers ────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap({
  accentColor,
  badge,
  preheader,
  heading,
  body,
  refId,
  ctaLabel,
  ctaHref,
  footer,
}: {
  accentColor: string;
  badge: string;
  preheader: string;
  heading: string;
  body: string;
  refId: string;
  ctaLabel?: string;
  ctaHref?: string;
  footer: string;
}): string {
  const cta =
    ctaLabel && ctaHref
      ? `<a href="${ctaHref}" style="display:inline-block;margin-top:24px;padding:11px 22px;background:${accentColor};color:#fff;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none;">${ctaLabel} →</a>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <!-- preheader -->
  <span style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}&zwnj;&nbsp;</span>

  <div style="padding:40px 16px;">
    <div style="max-width:540px;margin:0 auto;background:#111827;border-radius:16px;border:1px solid ${accentColor}33;overflow:hidden;">

      <!-- top accent bar -->
      <div style="height:3px;background:linear-gradient(90deg,${accentColor},${accentColor}88);"></div>

      <div style="padding:32px 28px;">

        <!-- logo -->
        <p style="margin:0 0 20px;font-size:15px;font-weight:700;color:#f9fafb;letter-spacing:-0.3px;">
          1neLink
        </p>

        <!-- badge -->
        <span style="display:inline-block;padding:4px 12px;border-radius:6px;background:${accentColor}22;color:${accentColor};font-size:11px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;margin-bottom:18px;">${badge}</span>

        <!-- heading -->
        <h1 style="margin:0 0 14px;color:#f9fafb;font-size:20px;font-weight:700;line-height:1.3;">${heading}</h1>

        <!-- body -->
        <div style="color:#9ca3af;font-size:14px;line-height:1.75;">${body}</div>

        ${cta}

        <!-- ref -->
        <div style="margin-top:28px;padding:14px 16px;background:#0f172a;border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
          <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;">Reference ID</p>
          <p style="margin:4px 0 0;color:#d1d5db;font-size:13px;font-family:monospace;">${esc(refId)}</p>
        </div>

        <!-- footer -->
        <div style="margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;color:#4b5563;font-size:11px;line-height:1.6;">
            ${footer}<br>
            If you did not submit this complaint, please contact us at
            <a href="mailto:legal@1nelink.com" style="color:#6b7280;">legal@1nelink.com</a>
          </p>
        </div>

      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── 1. Submitted ────────────────────────────────────────────────────────────

export function sendDmcaSubmittedEmail(opts: {
  to: string;
  firstName: string;
  reportId: string;
  infringingUrl: string;
}): void {
  const html = wrap({
    accentColor: "#3b82f6",
    badge: "Complaint Received",
    preheader: `Your DMCA complaint has been received — Ref: ${opts.reportId}`,
    heading: "We've received your DMCA complaint",
    body: `
      <p style="margin:0 0 12px;">Hi ${esc(opts.firstName)},</p>
      <p style="margin:0 0 12px;">
        Your intellectual property complaint has been received and is in our
        moderation queue. Our compliance team will review your submission
        and respond within <strong style="color:#e5e7eb;">3–5 business days</strong>.
      </p>
      <p style="margin:0 0 12px;">
        <strong style="color:#e5e7eb;">Reported URL:</strong><br>
        <span style="word-break:break-all;">${esc(opts.infringingUrl)}</span>
      </p>
      <p style="margin:0;">
        You can check the status of your complaint at any time or submit
        additional evidence by contacting us at
        <a href="mailto:legal@1nelink.com" style="color:#60a5fa;">legal@1nelink.com</a>
        quoting your reference ID.
      </p>
    `,
    refId: opts.reportId,
    ctaLabel: "View DMCA Policy",
    ctaHref: `${SITE_URL}/legal/dmca`,
    footer: "You are receiving this because you submitted a DMCA complaint on 1neLink.",
  });

  sendEmailAsync({
    type: "DMCA_SUBMITTED" as EmailType,
    to: opts.to,
    subject: `DMCA Complaint Received — Ref ${opts.reportId.slice(0, 8).toUpperCase()}`,
    html,
  });
}

// ─── 2. Under Review ─────────────────────────────────────────────────────────

export function sendDmcaReviewingEmail(opts: {
  to: string;
  firstName: string;
  reportId: string;
  infringingUrl: string;
}): void {
  const html = wrap({
    accentColor: "#f59e0b",
    badge: "Under Review",
    preheader: `Your DMCA complaint is now under review — Ref: ${opts.reportId}`,
    heading: "Your complaint is under review",
    body: `
      <p style="margin:0 0 12px;">Hi ${esc(opts.firstName)},</p>
      <p style="margin:0 0 12px;">
        A member of our compliance team has picked up your DMCA complaint
        and is actively reviewing the reported content. We may reach out
        to you if we need additional information.
      </p>
      <p style="margin:0 0 12px;">
        <strong style="color:#e5e7eb;">Reported URL:</strong><br>
        <span style="word-break:break-all;">${esc(opts.infringingUrl)}</span>
      </p>
      <p style="margin:0;">
        We aim to complete our review within 2–3 business days from this notice.
        If you have additional evidence, reply to this email or contact
        <a href="mailto:legal@1nelink.com" style="color:#fbbf24;">legal@1nelink.com</a>
        with your reference ID.
      </p>
    `,
    refId: opts.reportId,
    footer: "You are receiving this because you submitted a DMCA complaint on 1neLink.",
  });

  sendEmailAsync({
    type: "DMCA_REVIEWING" as EmailType,
    to: opts.to,
    subject: `DMCA Complaint Under Review — Ref ${opts.reportId.slice(0, 8).toUpperCase()}`,
    html,
  });
}

// ─── 3. Resolved ─────────────────────────────────────────────────────────────

export function sendDmcaResolvedEmail(opts: {
  to: string;
  firstName: string;
  reportId: string;
  infringingUrl: string;
  moderatorNotes?: string | null;
}): void {
  const notesBlock = opts.moderatorNotes
    ? `<div style="margin:16px 0;padding:14px 16px;background:#0f172a;border-left:3px solid #22c55e;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;margin-bottom:6px;">Action Taken</p>
        <p style="margin:0;color:#d1d5db;font-size:13px;line-height:1.6;">${esc(opts.moderatorNotes)}</p>
      </div>`
    : "";

  const html = wrap({
    accentColor: "#22c55e",
    badge: "Resolved",
    preheader: `Your DMCA complaint has been resolved — Ref: ${opts.reportId}`,
    heading: "Your complaint has been resolved",
    body: `
      <p style="margin:0 0 12px;">Hi ${esc(opts.firstName)},</p>
      <p style="margin:0 0 12px;">
        We have completed our review of your DMCA complaint and have taken
        appropriate action against the reported content.
      </p>
      <p style="margin:0 0 12px;">
        <strong style="color:#e5e7eb;">Reported URL:</strong><br>
        <span style="word-break:break-all;">${esc(opts.infringingUrl)}</span>
      </p>
      ${notesBlock}
      <p style="margin:0;">
        If the infringing content reappears or you have further concerns,
        please submit a new complaint or contact us at
        <a href="mailto:legal@1nelink.com" style="color:#4ade80;">legal@1nelink.com</a>.
      </p>
    `,
    refId: opts.reportId,
    ctaLabel: "Submit Another Complaint",
    ctaHref: `${SITE_URL}/dashboard/support/dmca`,
    footer: "You are receiving this because you submitted a DMCA complaint on 1neLink.",
  });

  sendEmailAsync({
    type: "DMCA_RESOLVED" as EmailType,
    to: opts.to,
    subject: `DMCA Complaint Resolved — Ref ${opts.reportId.slice(0, 8).toUpperCase()}`,
    html,
  });
}

// ─── 4. Rejected ─────────────────────────────────────────────────────────────

export function sendDmcaRejectedEmail(opts: {
  to: string;
  firstName: string;
  reportId: string;
  infringingUrl: string;
  moderatorNotes?: string | null;
}): void {
  const notesBlock = opts.moderatorNotes
    ? `<div style="margin:16px 0;padding:14px 16px;background:#0f172a;border-left:3px solid #ef4444;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;margin-bottom:6px;">Reason</p>
        <p style="margin:0;color:#d1d5db;font-size:13px;line-height:1.6;">${esc(opts.moderatorNotes)}</p>
      </div>`
    : "";

  const html = wrap({
    accentColor: "#ef4444",
    badge: "Not Actioned",
    preheader: `Update on your DMCA complaint — Ref: ${opts.reportId}`,
    heading: "We were unable to action your complaint",
    body: `
      <p style="margin:0 0 12px;">Hi ${esc(opts.firstName)},</p>
      <p style="margin:0 0 12px;">
        After reviewing your DMCA complaint, our team was unable to verify
        the infringement or take the requested action at this time.
      </p>
      <p style="margin:0 0 12px;">
        <strong style="color:#e5e7eb;">Reported URL:</strong><br>
        <span style="word-break:break-all;">${esc(opts.infringingUrl)}</span>
      </p>
      ${notesBlock}
      <p style="margin:0 0 12px;">
        If you believe this decision was made in error or you have additional
        evidence to support your claim, you may submit a new complaint with
        supporting documentation.
      </p>
      <p style="margin:0;">
        For legal matters, please contact us at
        <a href="mailto:legal@1nelink.com" style="color:#f87171;">legal@1nelink.com</a>.
      </p>
    `,
    refId: opts.reportId,
    ctaLabel: "Submit New Complaint",
    ctaHref: `${SITE_URL}/dashboard/support/dmca`,
    footer: "You are receiving this because you submitted a DMCA complaint on 1neLink.",
  });

  sendEmailAsync({
    type: "DMCA_REJECTED" as EmailType,
    to: opts.to,
    subject: `Update on Your DMCA Complaint — Ref ${opts.reportId.slice(0, 8).toUpperCase()}`,
    html,
  });
}
