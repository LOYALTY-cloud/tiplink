/**
 * HTML email templates for the Elite Creator Program.
 * Three triggers:
 *   1. Application submitted  → eliteCreatorSubmittedHtml()
 *   2. Application approved   → eliteCreatorApprovedHtml()
 *   3. Application rejected   → eliteCreatorRejectedHtml()
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0a0a0a;
  color: #e5e7eb;
  margin: 0;
  padding: 0;
`;

const cardStyle = `
  max-width: 520px;
  margin: 40px auto;
  background: #111827;
  border-radius: 16px;
  padding: 32px;
  border: 1px solid rgba(255,255,255,0.08);
`;

const footerStyle = `
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 20px;
  margin-top: 28px;
  color: #6b7280;
  font-size: 11px;
  line-height: 1.6;
`;

/**
 * Sent immediately after a user submits an elite creator application.
 */
export function eliteCreatorSubmittedHtml(name: string): string {
  const displayName = esc(name || "Creator");
  return `
<body style="${baseStyle}">
  <div style="${cardStyle}">
    <div style="margin-bottom: 24px;">
      <span style="
        display: inline-block;
        padding: 4px 12px;
        border-radius: 9999px;
        background: rgba(236,72,153,0.12);
        color: #ec4899;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      ">Elite Creator Program</span>
    </div>

    <h2 style="margin: 0 0 8px; color: #f9fafb; font-size: 22px; font-weight: 700;">
      Application Received 🚀
    </h2>

    <p style="margin: 0 0 20px; color: #9ca3af; font-size: 14px; line-height: 1.6;">
      Hey ${displayName},
    </p>

    <p style="margin: 0 0 20px; color: #d1d5db; font-size: 14px; line-height: 1.6;">
      Your application to join the <strong style="color: #f9fafb;">1neLink Elite Creator Program</strong> has been received.
      We review every application carefully to maintain a high-quality, exclusive creator community.
    </p>

    <div style="
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    ">
      <p style="margin: 0 0 12px; color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
        If accepted, you'll unlock
      </p>
      <p style="margin: 0; color: #e5e7eb; font-size: 14px; line-height: 2;">
        💰 Monetization tools &amp; earnings<br/>
        🎨 Advanced theme builder<br/>
        📊 Creator analytics dashboard<br/>
        🚀 Increased creator visibility
      </p>
    </div>

    <p style="margin: 0 0 4px; color: #9ca3af; font-size: 13px; line-height: 1.6;">
      We'll be in touch soon — usually within 48 hours.
    </p>

    <div style="${footerStyle}">
      <p style="margin: 0;">
        1neLink Elite Creator Program &bull; <a href="https://1nelink.app" style="color: #ec4899; text-decoration: none;">1nelink.app</a><br/>
        This is an automated confirmation. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>`.trim();
}

/**
 * Sent when an admin approves an elite creator application.
 */
export function eliteCreatorApprovedHtml(name: string, setPasswordLink?: string): string {
  const displayName = esc(name || "Creator");
  return `
<body style="${baseStyle}">
  <div style="${cardStyle}">
    <div style="margin-bottom: 24px;">
      <span style="
        display: inline-block;
        padding: 4px 12px;
        border-radius: 9999px;
        background: rgba(34,197,94,0.12);
        color: #22c55e;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      ">Approved ✓</span>
    </div>

    <h2 style="margin: 0 0 8px; color: #f9fafb; font-size: 22px; font-weight: 700;">
      You're In 🎉
    </h2>

    <p style="margin: 0 0 20px; color: #9ca3af; font-size: 14px; line-height: 1.6;">
      Hey ${displayName},
    </p>

    <p style="margin: 0 0 20px; color: #d1d5db; font-size: 14px; line-height: 1.6;">
      You've been approved as a <strong style="color: #f9fafb;">1neLink Elite Creator</strong>.
      Your account is now unlocked for full monetization.
    </p>

    <div style="
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(34,197,94,0.15);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 28px;
    ">
      <p style="margin: 0 0 12px; color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
        Your Creator Access
      </p>
      <p style="margin: 0; color: #e5e7eb; font-size: 14px; line-height: 2;">
        💰 Earn from theme sales &amp; downloads<br/>
        🎨 Publish themes to the Theme Store<br/>
        📊 Full analytics &amp; earnings reporting<br/>
        🔗 Creator profile badge
      </p>
    </div>

    <a href="https://1nelink.app/dashboard"
       style="
         display: inline-block;
         padding: 12px 24px;
         background: linear-gradient(90deg, #ec4899, #8b5cf6);
         color: #fff;
         font-size: 14px;
         font-weight: 700;
         border-radius: 10px;
         text-decoration: none;
         letter-spacing: 0.02em;
       ">
      Go to Creator Dashboard →
    </a>

    ${setPasswordLink ? `
    <div style="margin-top: 20px;">
      <p style="margin: 0 0 10px; color: #9ca3af; font-size: 13px; line-height: 1.5;">
        Your account has been created. Click below to set your password and access your dashboard.
      </p>
      <a href="${esc(setPasswordLink)}"
         style="
           display: inline-block;
           padding: 12px 24px;
           background: rgba(255,255,255,0.08);
           color: #f9fafb;
           font-size: 14px;
           font-weight: 700;
           border-radius: 10px;
           text-decoration: none;
           border: 1px solid rgba(255,255,255,0.15);
         ">
        Set Your Password →
      </a>
    </div>` : ``}

    <div style="${footerStyle}">
      <p style="margin: 0;">
        1neLink Elite Creator Program &bull; <a href="https://1nelink.app" style="color: #ec4899; text-decoration: none;">1nelink.app</a><br/>
        You're receiving this because your application was approved.
      </p>
    </div>
  </div>
</body>`.trim();
}

/**
 * Sent when an admin rejects an elite creator application.
 */
export function eliteCreatorRejectedHtml(name: string): string {
  const displayName = esc(name || "Creator");
  return `
<body style="${baseStyle}">
  <div style="${cardStyle}">
    <div style="margin-bottom: 24px;">
      <span style="
        display: inline-block;
        padding: 4px 12px;
        border-radius: 9999px;
        background: rgba(239,68,68,0.12);
        color: #ef4444;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      ">Update</span>
    </div>

    <h2 style="margin: 0 0 8px; color: #f9fafb; font-size: 22px; font-weight: 700;">
      Application Not Approved
    </h2>

    <p style="margin: 0 0 20px; color: #9ca3af; font-size: 14px; line-height: 1.6;">
      Hey ${displayName},
    </p>

    <p style="margin: 0 0 16px; color: #d1d5db; font-size: 14px; line-height: 1.6;">
      Thanks again for applying to the <strong style="color: #f9fafb;">1neLink Elite Creator Program</strong>.
      At this time, we are unable to approve your application.
    </p>

    <p style="margin: 0 0 22px; color: #d1d5db; font-size: 14px; line-height: 1.6;">
      You can continue using 1neLink and submit a new application later after growing your profile,
      portfolio, or creator activity.
    </p>

    <a href="https://1nelink.app/dashboard"
       style="
         display: inline-block;
         padding: 12px 24px;
         background: rgba(255,255,255,0.08);
         color: #fff;
         font-size: 14px;
         font-weight: 700;
         border-radius: 10px;
         text-decoration: none;
         letter-spacing: 0.02em;
       ">
      Go to Dashboard →
    </a>

    <div style="${footerStyle}">
      <p style="margin: 0;">
        1neLink Elite Creator Program &bull; <a href="https://1nelink.app" style="color: #ec4899; text-decoration: none;">1nelink.app</a><br/>
        You're receiving this because your application was reviewed by our team.
      </p>
    </div>
  </div>
</body>`.trim();
}
