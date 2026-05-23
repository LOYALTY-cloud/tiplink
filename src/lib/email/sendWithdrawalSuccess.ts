import { emailFooter } from "@/lib/email/footer";
import { sendEmail } from "@/lib/emailService";

type SendWithdrawalSuccessArgs = {
  to: string;
  withdrawalId: string;
  amountUsd: string;
  feeUsd: string;
  netUsd: string;
  status: "approved" | "pending" | "under_review";
  delayDays?: number;
  releaseDateStr?: string;
};

const STATUS_LABELS: Record<SendWithdrawalSuccessArgs["status"], string> = {
  approved: "Initiated",
  pending: "Scheduled",
  under_review: "Under Review",
};

const STATUS_COLORS: Record<SendWithdrawalSuccessArgs["status"], string> = {
  approved: "#22c55e",
  pending: "#f59e0b",
  under_review: "#f59e0b",
};

export async function sendWithdrawalSuccess(args: SendWithdrawalSuccessArgs) {
  const subject =
    args.status === "approved"
      ? `Payout initiated — ${args.netUsd}`
      : `Withdrawal received — ${args.netUsd}`;

  const statusLabel = STATUS_LABELS[args.status];
  const statusColor = STATUS_COLORS[args.status];

  const timingNote =
    args.status === "approved"
      ? "Your funds are on the way and should arrive within minutes to a few hours."
      : args.status === "pending" && args.releaseDateStr
      ? `Your payout is scheduled to be released on ${args.releaseDateStr}. It should arrive within 1–3 business days after that.`
      : args.status === "under_review"
      ? "Your withdrawal is being reviewed by our team. You'll hear from us within 1–2 business days."
      : "Your withdrawal is being processed and will be sent shortly.";

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
          <td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);border-radius:2px;"></td>
        </tr>
      </table>
    </div>

    <!-- Title -->
    <h2 style="text-align:center;margin:0 0 6px;font-size:20px;font-weight:700;color:#ffffff;">
      Withdrawal ${statusLabel}
    </h2>
    <p style="text-align:center;margin:0 0 24px;font-size:13px;color:#9ca3af;">
      ${timingNote}
    </p>

    <!-- Amount block -->
    <div style="text-align:center;background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.15);border-radius:14px;padding:20px;margin-bottom:20px;">
      <div style="font-size:36px;font-weight:800;color:#22c55e;letter-spacing:-1px;">${args.netUsd}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Net payout to your bank</div>
    </div>

    <!-- Breakdown -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:16px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:13px;color:#9ca3af;padding:5px 0;">Gross amount</td>
          <td style="font-size:13px;color:#e5e7eb;text-align:right;padding:5px 0;">${args.amountUsd}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#9ca3af;padding:5px 0;">Platform fee</td>
          <td style="font-size:13px;color:#e5e7eb;text-align:right;padding:5px 0;">${args.feeUsd}</td>
        </tr>
        <tr>
          <td style="height:1px;background:rgba(255,255,255,0.08);" colspan="2"></td>
        </tr>
        <tr>
          <td style="font-size:14px;font-weight:600;color:#ffffff;padding:8px 0 0;">You receive</td>
          <td style="font-size:14px;font-weight:700;color:#22c55e;text-align:right;padding:8px 0 0;">${args.netUsd}</td>
        </tr>
      </table>
    </div>

    <!-- Meta -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:14px 16px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:12px;color:#9ca3af;padding:4px 0;">Withdrawal ID</td>
          <td style="font-size:12px;color:#e5e7eb;text-align:right;padding:4px 0;word-break:break-all;">${args.withdrawalId}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#9ca3af;padding:4px 0;">Status</td>
          <td style="font-size:12px;font-weight:600;color:${statusColor};text-align:right;padding:4px 0;">${statusLabel}</td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://1nelink.com/dashboard/wallet" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;padding:12px 28px;border-radius:10px;text-decoration:none;">
        View Wallet
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

  return sendEmail({ type: "WITHDRAWAL_SUCCESS", to: args.to, subject, html });
}
