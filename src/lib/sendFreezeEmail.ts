/**
 * Freeze Email — Branded, actionable email sent when a user is frozen.
 *
 * Separate from the generic notification email to allow freeze-specific
 * design: clear reason, CTA to unfreeze, support fallback.
 */

import { emailFooter } from "@/lib/email/footer";
import { sendEmail } from "@/lib/emailService";

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://1nelink.com";

type FreezeEmailOptions = {
  email: string;
  reason: string;
  freezeLevel: "soft" | "hard";
  handle?: string | null;
  explanations?: string[];
  summary?: string;
};

export async function sendFreezeEmail({
  email,
  reason,
  freezeLevel,
  handle,
  explanations,
  summary,
}: FreezeEmailOptions): Promise<void> {
  const isSoft = freezeLevel === "soft";
  const greeting = handle ? `Hi @${handle},` : "Hi there,";

  const ctaUrl = isSoft
    ? `${APP_URL}/dashboard`
    : `${APP_URL}/dashboard?tab=support`;

  const ctaLabel = isSoft ? "Verify & Unlock →" : "Contact Support →";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
        <tr>
          <td align="center" style="padding:30px 20px 10px 20px;">
            <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png"
                 alt="1neLink" width="150"
                 style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" />
          </td>
        </tr>
        <tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr>
        <tr><td height="10"></td></tr>
      </table>

      <p style="margin:16px 0 8px;font-size:20px;color:#dc2626;font-weight:700;">
        ⚠️ Withdrawals temporarily paused
      </p>

      <p style="margin:0 0 12px;color:#444;font-size:14px;">${greeting}</p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        ${summary
          ? `<p style="margin:0 0 12px;color:#444;font-size:14px;">${sanitizeHtml(summary)}</p>`
          : `<p style="margin:0;color:#444;font-size:14px;">We detected a security signal on your account:</p>`
        }
        ${explanations && explanations.length > 0
          ? `<ul style="margin:8px 0 0;padding-left:20px;color:#111;font-size:14px;">${explanations.map((e) => `<li style="margin:4px 0;">${sanitizeHtml(e)}</li>`).join("")}</ul>`
          : `<p style="margin:12px 0 0;color:#111;font-size:14px;font-weight:700;">${sanitizeHtml(reason)}</p>`
        }
      </div>

      <p style="margin:12px 0;color:#444;font-size:14px;">
        ${isSoft
          ? "This is usually quick to resolve. Verify your identity from your dashboard to unlock your account."
          : "This restriction requires a support review. Our team will look into it promptly."
        }
      </p>

      <a href="${ctaUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:${isSoft ? "#00e0ff" : "#111827"};color:${isSoft ? "#000" : "#fff"};border-radius:8px;text-decoration:none;font-weight:600;">
        ${ctaLabel}
      </a>

      <p style="margin:16px 0 0;color:#666;font-size:13px;">
        If this wasn't you, please secure your account immediately and contact
        <a href="mailto:support@1nelink.com" style="color:#6b7280;">support@1nelink.com</a>.
      </p>

      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You received this email because your 1neLink account had a security event.
        <a href="${APP_URL}/dashboard" style="color:#6b7280;">Manage settings</a>
      </p>
      ${emailFooter()}
    </div>
  </div>`;

  await sendEmail({
    type: "ACCOUNT_FREEZE",
    to: email,
    subject: "⚠️ Action required: withdrawals paused",
    html,
  });
}

/** Prevent HTML injection in reason strings */
function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
