/**
 * Unfreeze Emails — sent when an admin lifts an account restriction.
 *
 * Two variants:
 *   sendUnfreezeEmail()     — permanent unfreeze (account fully restored)
 *   sendTempUnfreezeEmail() — temporary window granted to withdraw funds
 */

import { emailFooter } from "@/lib/email/footer";
import { sendEmail } from "@/lib/emailService";

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://1nelink.com";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoHeader(): string {
  return `
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
  </table>`;
}

/* ── 1. Permanent unfreeze ─────────────────────────────────────────────────── */

type UnfreezeEmailOptions = {
  email: string;
  handle?: string | null;
};

export async function sendUnfreezeEmail({ email, handle }: UnfreezeEmailOptions): Promise<void> {
  const greeting = handle ? `Hi @${esc(handle)},` : "Hi there,";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      ${logoHeader()}

      <p style="margin:16px 0 8px;font-size:20px;color:#16a34a;font-weight:700;">
        ✅ Account restored
      </p>

      <p style="margin:0 0 12px;color:#444;font-size:14px;">${greeting}</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:12px 0;">
        <p style="margin:0;color:#15803d;font-size:14px;font-weight:600;">
          Your account restriction has been lifted.
        </p>
        <p style="margin:8px 0 0;color:#444;font-size:14px;">
          Withdrawals and all account features are now fully available again.
          You can head to your wallet to make a withdrawal at any time.
        </p>
      </div>

      <a href="${APP_URL}/dashboard/wallet"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#00e0ff;color:#000;border-radius:8px;text-decoration:none;font-weight:600;">
        Go to Wallet →
      </a>

      <p style="margin:16px 0 0;color:#666;font-size:13px;">
        If you believe this access change was made in error, contact us at
        <a href="mailto:support@1nelink.com" style="color:#6b7280;">support@1nelink.com</a>.
      </p>

      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You received this email because of a security event on your 1neLink account.
        <a href="${APP_URL}/dashboard" style="color:#6b7280;">Manage settings</a>
      </p>
      ${emailFooter()}
    </div>
  </div>`;

  await sendEmail({
    type: "ACCOUNT_UNFREEZE",
    to: email,
    subject: "✅ Your account has been restored",
    html,
  });
}

/* ── 2. Temporary unfreeze window ─────────────────────────────────────────── */

type TempUnfreezeEmailOptions = {
  email: string;
  handle?: string | null;
  hours: number;
  expiresAt: string; // ISO timestamp
};

export async function sendTempUnfreezeEmail({
  email,
  handle,
  hours,
  expiresAt,
}: TempUnfreezeEmailOptions): Promise<void> {
  const greeting = handle ? `Hi @${esc(handle)},` : "Hi there,";
  const expiry = new Date(expiresAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      ${logoHeader()}

      <p style="margin:16px 0 8px;font-size:20px;color:#d97706;font-weight:700;">
        ⏱ Temporary withdrawal window opened
      </p>

      <p style="margin:0 0 12px;color:#444;font-size:14px;">${greeting}</p>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;margin:12px 0;">
        <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">
          An admin has temporarily enabled withdrawals on your account.
        </p>
        <p style="margin:8px 0 0;color:#444;font-size:14px;">
          You have a <strong>${hours}-hour window</strong> to withdraw your funds.
          This window will close at:
        </p>
        <p style="margin:10px 0 0;font-size:16px;font-weight:700;color:#111;">
          ${esc(expiry)}
        </p>
      </div>

      <p style="margin:12px 0;color:#444;font-size:14px;">
        After the window closes, withdrawal restrictions will resume automatically.
        If you need more time or a full account restoration, please contact our support team.
      </p>

      <a href="${APP_URL}/dashboard/wallet"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#f59e0b;color:#000;border-radius:8px;text-decoration:none;font-weight:600;">
        Withdraw Funds Now →
      </a>

      <p style="margin:16px 0 0;color:#666;font-size:13px;">
        Questions? Contact us at
        <a href="mailto:support@1nelink.com" style="color:#6b7280;">support@1nelink.com</a>.
      </p>

      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You received this email because of a security event on your 1neLink account.
        <a href="${APP_URL}/dashboard" style="color:#6b7280;">Manage settings</a>
      </p>
      ${emailFooter()}
    </div>
  </div>`;

  await sendEmail({
    type: "ACCOUNT_TEMP_UNFREEZE",
    to: email,
    subject: `⏱ Withdrawal window open for ${hours} hour${hours !== 1 ? "s" : ""} — act now`,
    html,
  });
}
