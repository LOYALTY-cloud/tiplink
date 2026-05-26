import { emailFooter } from "@/lib/email/footer";

type Args = {
  displayName?: string;
  reason: string;
  durationDays: number | null;   // null = indefinite
  disabledUntil: string | null;  // ISO timestamp or null
};

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildStoreDisabledEmail(args: Args): string {
  const name = args.displayName?.trim() || "there";

  const durationLine = args.durationDays != null && args.disabledUntil
    ? `${args.durationDays} day${args.durationDays !== 1 ? "s" : ""} (until ${new Date(args.disabledUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })})`
    : "Indefinitely — until an admin removes the restriction";

  return `
<div style="background:#060B18;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb;">
  <div style="max-width:480px;margin:0 auto;background:#0f172a;border-radius:20px;padding:28px 24px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 40px rgba(0,0,0,0.5);">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding:0 0 12px 0;">
            <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="130" style="display:block;width:130px;max-width:160px;height:auto;border-radius:12px;" />
          </td>
        </tr>
        <tr>
          <td style="height:2px;background:linear-gradient(to right,#f59e0b,#ef4444);border-radius:2px;"></td>
        </tr>
      </table>
    </div>

    <!-- Icon + heading -->
    <div style="text-align:center;margin-bottom:8px;">
      <div style="display:inline-block;background:rgba(245,158,11,0.12);border-radius:50%;width:52px;height:52px;line-height:52px;font-size:24px;">🚫</div>
    </div>
    <h2 style="text-align:center;margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
      Your Store Has Been Restricted
    </h2>
    <p style="text-align:center;margin:0 0 28px;font-size:14px;color:#9ca3af;line-height:1.6;">
      Hi ${esc(name)}, your 1neLink creator store has been temporarily taken offline by our moderation team.
    </p>

    <!-- Details card -->
    <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:14px;padding:18px 20px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;color:#fbbf24;letter-spacing:0.5px;margin-bottom:14px;">RESTRICTION DETAILS</div>

      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="width:90px;font-size:12px;color:#9ca3af;padding-bottom:10px;vertical-align:top;">Reason</td>
          <td style="font-size:13px;color:#e5e7eb;padding-bottom:10px;vertical-align:top;">${esc(args.reason)}</td>
        </tr>
        <tr>
          <td style="width:90px;font-size:12px;color:#9ca3af;padding-bottom:10px;vertical-align:top;">Duration</td>
          <td style="font-size:13px;color:#e5e7eb;padding-bottom:10px;vertical-align:top;">${esc(durationLine)}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#9ca3af;vertical-align:top;">Impact</td>
          <td style="font-size:13px;color:#e5e7eb;vertical-align:top;">Your store page is hidden and your themes won't appear in the marketplace. Existing theme unlocks are not affected.</td>
        </tr>
      </table>
    </div>

    <!-- What to do -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;color:#9ca3af;letter-spacing:0.5px;margin-bottom:10px;">WHAT YOU CAN DO</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#f59e0b;font-size:13px;">→</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">Review our <a href="https://1nelink.app/terms" style="color:#fbbf24;text-decoration:none;">Terms of Service</a> and <a href="https://1nelink.app/creator-guidelines" style="color:#fbbf24;text-decoration:none;">Creator Guidelines</a></td>
        </tr>
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#f59e0b;font-size:13px;">→</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">Contact our support team if you believe this is an error</td>
        </tr>
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#f59e0b;font-size:13px;">→</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;">Your account, tips, and wallet remain active during this restriction</td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:20px;">
      <a href="mailto:support@1nelink.com" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:13px;font-weight:600;border-radius:10px;text-decoration:none;">
        Contact Support →
      </a>
    </div>

    <!-- Trust badge -->
    <div style="text-align:center;">
      <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(245,158,11,0.1);color:#fbbf24;font-size:11px;font-weight:500;">
        Account intact &#8226; Wallet active &#8226; 1neLink
      </div>
    </div>

    ${emailFooter()}
  </div>
</div>`;
}
