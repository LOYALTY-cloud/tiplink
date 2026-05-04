import { emailFooter } from "@/lib/email/footer";
import { sendEmailAsync } from "@/lib/emailService";

type NewDeviceEmailParams = {
  to: string;
  device: string;   // e.g. "Chrome on Windows"
  ip: string;
  location?: string;
  time: string;      // formatted timestamp
};

/**
 * Send "New device login detected" security email.
 * Fire-and-forget — never blocks the auth flow.
 */
export async function sendNewDeviceEmail(params: NewDeviceEmailParams): Promise<void> {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#060B18;color:#e5e7eb;padding:40px 20px;">
      <div style="max-width:480px;margin:0 auto;">

        <!-- Header -->
        <div style="text-align:center;margin-bottom:32px;">
          <img src="https://1nelink.app/logo.png" alt="1neLink" width="44" style="margin-bottom:12px;" />
          <h1 style="color:#f9fafb;font-size:22px;font-weight:600;margin:0;">New Device Login Detected</h1>
        </div>

        <!-- Alert Card -->
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;margin-bottom:12px;">
            <span style="font-size:20px;margin-right:10px;">🔐</span>
            <span style="color:#f87171;font-size:14px;font-weight:600;">Security Alert</span>
          </div>
          <p style="color:#d1d5db;font-size:14px;line-height:1.6;margin:0;">
            We detected a login to your 1neLink account from a device we haven't seen before.
            If this was you, no action is needed.
          </p>
        </div>

        <!-- Device Details -->
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
          <table style="width:100%;border-spacing:0;font-size:14px;">
            <tr>
              <td style="color:#9ca3af;padding:6px 0;width:100px;">Device</td>
              <td style="color:#f9fafb;padding:6px 0;">${params.device}</td>
            </tr>
            <tr>
              <td style="color:#9ca3af;padding:6px 0;">IP Address</td>
              <td style="color:#f9fafb;padding:6px 0;">${params.ip}</td>
            </tr>
            ${params.location ? `<tr>
              <td style="color:#9ca3af;padding:6px 0;">Location</td>
              <td style="color:#f9fafb;padding:6px 0;">${params.location}</td>
            </tr>` : ""}
            <tr>
              <td style="color:#9ca3af;padding:6px 0;">Time</td>
              <td style="color:#f9fafb;padding:6px 0;">${params.time}</td>
            </tr>
          </table>
        </div>

        <!-- Warning -->
        <div style="background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.2);border-radius:12px;padding:16px;margin-bottom:24px;">
          <p style="color:#fbbf24;font-size:13px;line-height:1.5;margin:0;">
            ⚠️ <strong>Not you?</strong> Change your password immediately and review your
            <a href="https://1nelink.app/dashboard/settings" style="color:#60a5fa;text-decoration:underline;">security settings</a>.
          </p>
        </div>

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:32px;">
          <a href="https://1nelink.app/dashboard/settings"
             style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;text-decoration:none;">
            Review Login Activity
          </a>
        </div>

        ${emailFooter()}
      </div>
    </div>
    `;

  sendEmailAsync({
    type: "NEW_DEVICE_LOGIN",
    to: params.to,
    subject: "🔐 New device login detected — 1neLink",
    html,
  });
}