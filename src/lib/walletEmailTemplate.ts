/**
 * Premium fintech-style email templates for 1neLink wallet emails.
 * Dark theme, trust badges, social icons, compliance footer.
 */

/* ── shared wrapper (header + footer) ────────────── */

function wrap(inner: string): string {
  return `
<div style="background:#060B18;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb;">
  <div style="max-width:480px;margin:0 auto;background:#0f172a;border-radius:20px;padding:28px 24px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 40px rgba(0,0,0,0.5);">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:0;">
        <tr>
          <td align="center" style="padding:0 0 12px 0;">
            <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="130" style="display:block;width:130px;max-width:160px;height:auto;border-radius:12px;" />
          </td>
        </tr>
        <tr>
          <td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);border-radius:2px;"></td>
        </tr>
      </table>
    </div>

    ${inner}

    <!-- Trust Badge -->
    <div style="text-align:center;margin-top:20px;">
      <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(34,197,94,0.1);color:#22c55e;font-size:11px;font-weight:500;">
        Secure &#8226; Encrypted &#8226; 1neLink
      </div>
    </div>

  </div>

  <!-- Footer -->
  <div style="max-width:480px;margin:20px auto 0;text-align:center;font-size:11px;color:#6b7280;line-height:1.6;">

    <!-- Social Icons -->
    <div style="margin-bottom:14px;">
      <a href="https://www.instagram.com/1nelink26?igsh=ZWRmcmhqYjdvaGo=" style="margin:0 6px;display:inline-block;">
        <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="20" alt="Instagram" style="opacity:0.8;" />
      </a>
      <a href="https://x.com/1neLink" style="margin:0 6px;display:inline-block;">
        <img src="https://cdn-icons-png.flaticon.com/512/5968/5968830.png" width="20" alt="X" style="opacity:0.8;" />
      </a>
      <a href="https://www.tiktok.com/@1nelink2?_r=1&_t=ZT-95QuzIkMZ5R" style="margin:0 6px;display:inline-block;">
        <img src="https://cdn-icons-png.flaticon.com/512/3046/3046121.png" width="20" alt="TikTok" style="opacity:0.8;" />
      </a>
    </div>

    1neLink &#8226; Creator Payment Platform<br/>
    Augusta, GA, United States<br/>
    <a href="https://1nelink.app" style="color:#9ca3af;text-decoration:underline;">www.1nelink.app</a>

    <div style="margin-top:10px;">
      1neLink is a payment facilitation platform, not a bank. Payment services are provided by licensed financial partners.
    </div>

    <div style="margin-top:10px;">
      Need help?
      <a href="mailto:support@1nelink.com" style="color:#22c55e;text-decoration:none;">support@1nelink.com</a>
    </div>

  </div>
</div>`;
}

/* ── public builders ─────────────────────────────── */

/** Wallet unlock OTP email (green code box) */
export function walletUnlockEmail(code: string): string {
  return wrap(`
    <h2 style="text-align:center;font-size:20px;font-weight:600;margin:0 0 8px;color:#ffffff;">
      Unlock Your Wallet
    </h2>
    <p style="text-align:center;font-size:13px;color:#9ca3af;margin:0 0 20px;">
      Enter this secure code to access your wallet.<br/>
      This code expires in <strong style="color:#fff;">10 minutes</strong>.
    </p>
    <div style="text-align:center;font-size:32px;letter-spacing:8px;font-weight:700;padding:18px 0;border-radius:14px;background:linear-gradient(135deg,#111827,#1f2937);color:#ffffff;margin-bottom:18px;border:1px solid rgba(255,255,255,0.08);">
      ${code}
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  `);
}

/** Disable wallet protection OTP email (red-tinted code box) */
export function walletDisableCodeEmail(code: string): string {
  return wrap(`
    <h2 style="text-align:center;font-size:20px;font-weight:600;margin:0 0 8px;color:#ffffff;">
      Disable Wallet Protection
    </h2>
    <p style="text-align:center;font-size:13px;color:#9ca3af;margin:0 0 20px;">
      Use this code to confirm disabling wallet 2FA.<br/>
      This code expires in <strong style="color:#fff;">5 minutes</strong>.
    </p>
    <div style="text-align:center;font-size:32px;letter-spacing:8px;font-weight:700;padding:18px 0;border-radius:14px;background:linear-gradient(135deg,#1c1013,#2a1215);color:#f87171;margin-bottom:18px;border:1px solid rgba(248,113,113,0.15);">
      ${code}
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0;">
      If you didn't request this, your account may be compromised.<br/>
      Change your password immediately.
    </p>
  `);
}

/** Security alert email (enable/disable notifications) */
export function walletSecurityAlertEmail(title: string, message: string, warning: string): string {
  return wrap(`
    <h2 style="text-align:center;font-size:20px;font-weight:600;margin:0 0 8px;color:#ffffff;">
      ${title}
    </h2>
    <p style="text-align:center;font-size:13px;color:#9ca3af;margin:0 0 20px;">
      ${message}
    </p>
    <div style="text-align:center;padding:14px 18px;border-radius:12px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.15);margin-bottom:0;">
      <p style="margin:0;color:#f87171;font-size:12px;font-weight:500;">
        ${warning}
      </p>
    </div>
  `);
}
