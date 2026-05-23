import { emailFooter } from "@/lib/email/footer";
import { sendEmail } from "@/lib/emailService";

type SendPayoutFailedArgs = {
  to: string;
  amountUsd: string;
  friendlyReason: string;
  payoutId: string;
  withdrawalId?: string;
};

export async function sendPayoutFailed(args: SendPayoutFailedArgs) {
  const subject = `Action needed — your ${args.amountUsd} payout failed`;

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
          <td style="height:2px;background:linear-gradient(to right,#ef4444,#f97316);border-radius:2px;"></td>
        </tr>
      </table>
    </div>

    <!-- Alert icon + title -->
    <div style="text-align:center;margin-bottom:8px;">
      <div style="display:inline-block;background:rgba(239,68,68,0.12);border-radius:50%;width:52px;height:52px;line-height:52px;font-size:26px;">⚠️</div>
    </div>
    <h2 style="text-align:center;margin:0 0 6px;font-size:20px;font-weight:700;color:#ffffff;">
      Payout Failed
    </h2>
    <p style="text-align:center;margin:0 0 24px;font-size:13px;color:#9ca3af;">
      Your ${args.amountUsd} payout could not be completed. The funds have been returned to your 1neLink balance.
    </p>

    <!-- Reason card -->
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:14px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;color:#f87171;letter-spacing:0.5px;margin-bottom:6px;">REASON</div>
      <div style="font-size:14px;color:#e5e7eb;line-height:1.5;">${args.friendlyReason}</div>
    </div>

    <!-- What happens next -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;color:#9ca3af;letter-spacing:0.5px;margin-bottom:10px;">WHAT HAPPENS NEXT</div>
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:20px;vertical-align:top;padding-top:2px;color:#22c55e;font-size:14px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">The full amount (${args.amountUsd}) has been restored to your wallet balance.</td>
        </tr>
        <tr>
          <td style="width:20px;vertical-align:top;padding-top:2px;color:#22c55e;font-size:14px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;padding-bottom:8px;">You can retry the withdrawal once your bank details are corrected in Stripe.</td>
        </tr>
        <tr>
          <td style="width:20px;vertical-align:top;padding-top:2px;color:#22c55e;font-size:14px;">✓</td>
          <td style="font-size:13px;color:#d1d5db;line-height:1.5;">If you need help, contact us at <a href="mailto:support@1nelink.com" style="color:#22c55e;text-decoration:none;">support@1nelink.com</a></td>
        </tr>
      </table>
    </div>

    <!-- Meta -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:14px 16px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:12px;color:#9ca3af;padding:4px 0;">Amount</td>
          <td style="font-size:12px;color:#e5e7eb;text-align:right;padding:4px 0;">${args.amountUsd}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#9ca3af;padding:4px 0;">Payout ID</td>
          <td style="font-size:12px;color:#e5e7eb;text-align:right;padding:4px 0;word-break:break-all;">${args.payoutId}</td>
        </tr>
        ${args.withdrawalId ? `
        <tr>
          <td style="font-size:12px;color:#9ca3af;padding:4px 0;">Withdrawal ID</td>
          <td style="font-size:12px;color:#e5e7eb;text-align:right;padding:4px 0;word-break:break-all;">${args.withdrawalId}</td>
        </tr>` : ""}
      </table>
    </div>

    <!-- CTAs -->
    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://1nelink.com/dashboard/wallet" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;padding:12px 28px;border-radius:10px;text-decoration:none;margin-right:8px;">
        Go to Wallet
      </a>
      <a href="https://1nelink.com/dashboard/account?tab=stripe" style="display:inline-block;background:rgba(255,255,255,0.08);color:#e5e7eb;font-weight:600;font-size:13px;padding:12px 28px;border-radius:10px;text-decoration:none;">
        Fix Bank Details
      </a>
    </div>

    <!-- Trust badge -->
    <div style="text-align:center;">
      <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(34,197,94,0.1);color:#22c55e;font-size:11px;font-weight:500;">
        Secure &#8226; Encrypted &#8226; 1neLink
      </div>
    </div>

    ${emailFooter()}
  </div>
</div>`;

  return sendEmail({ type: "PAYOUT_FAILED", to: args.to, subject, html });
}
