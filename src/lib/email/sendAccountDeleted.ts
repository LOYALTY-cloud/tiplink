import { emailFooter } from "@/lib/email/footer";
import { sendEmail } from "@/lib/emailService";

type SendAccountDeletedArgs = {
  to: string;
  displayName?: string;
};

export async function sendAccountDeleted(args: SendAccountDeletedArgs) {
  const name = args.displayName?.trim() || "there";
  const subject = "Your 1neLink account has been deleted";
  const deletedAt = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `
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
          <td style="height:2px;background:linear-gradient(to right,#6366f1,#8b5cf6);border-radius:2px;"></td>
        </tr>
      </table>
    </div>

    <!-- Icon + heading -->
    <div style="text-align:center;margin-bottom:8px;">
      <div style="display:inline-block;background:rgba(99,102,241,0.12);border-radius:50%;width:52px;height:52px;line-height:52px;font-size:24px;">🗑️</div>
    </div>
    <h2 style="text-align:center;margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
      Account Deleted
    </h2>
    <p style="text-align:center;margin:0 0 28px;font-size:14px;color:#9ca3af;line-height:1.6;">
      Hi ${name}, your 1neLink account has been permanently deleted as requested. We're sorry to see you go.
    </p>

    <!-- Confirmation card -->
    <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:18px 20px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;color:#a5b4fc;letter-spacing:0.5px;margin-bottom:12px;">WHAT WAS REMOVED</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#818cf8;font-size:13px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">Your profile, handle, and all personal information</td>
        </tr>
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#818cf8;font-size:13px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">Your wallet, transaction history, and payment data</td>
        </tr>
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#818cf8;font-size:13px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">Your connected Stripe account and payout settings</td>
        </tr>
        <tr>
          <td style="width:18px;vertical-align:top;padding-top:3px;color:#818cf8;font-size:13px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;">Your login credentials and security data</td>
        </tr>
      </table>
    </div>

    <!-- Date + reassurance -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:12px;color:#9ca3af;padding:4px 0;">Deleted on</td>
          <td style="font-size:12px;color:#e5e7eb;text-align:right;padding:4px 0;">${deletedAt}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:12px;font-size:12px;color:#9ca3af;line-height:1.5;">
            This action is permanent and cannot be undone. If you'd like to return to 1neLink in the future, you're welcome to create a new account at any time.
          </td>
        </tr>
      </table>
    </div>

    <!-- Support note -->
    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.6;">
      Deleted by mistake or have questions?<br/>
      Reach us at <a href="mailto:support@1nelink.com" style="color:#818cf8;text-decoration:none;">support@1nelink.com</a>
    </p>

    <!-- Trust badge -->
    <div style="text-align:center;">
      <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(99,102,241,0.1);color:#a5b4fc;font-size:11px;font-weight:500;">
        Secure &#8226; Encrypted &#8226; 1neLink
      </div>
    </div>

    ${emailFooter()}
  </div>
</div>`;

  return sendEmail({ type: "ACCOUNT_DELETED", to: args.to, subject, html });
}
