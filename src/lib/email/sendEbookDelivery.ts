import { emailFooter } from "@/lib/email/footer";
import { sendEmail } from "@/lib/emailService";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type SendEbookDeliveryArgs = {
  to: string;
  productTitle: string;
  creatorName: string;
  receiptId: string;
  amountUsd: string;
  downloadUrl: string;
  expiresHours?: number;
};

export async function sendEbookDelivery(args: SendEbookDeliveryArgs) {
  const expiresHours = args.expiresHours ?? 48;
  const subject = `Your download: ${args.productTitle}`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
        <tr><td align="center" style="padding:30px 20px 10px 20px;">
          <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png"
            alt="1neLink" width="150" style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" />
        </td></tr>
        <tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr>
        <tr><td height="10"></td></tr>
      </table>

      <h2 style="margin:0 0 4px;color:#111827;">Your download is ready 🎉</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
        Thanks for supporting <strong>${escapeHtml(args.creatorName)}</strong>. Your file is attached below.
      </p>

      <!-- Product card -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Digital Product</p>
        <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(args.productTitle)}</p>
        <p style="margin:0;font-size:13px;color:#6b7280;">
          <strong style="color:#111827;">Amount paid:</strong> ${escapeHtml(args.amountUsd)}<br/>
          <strong style="color:#111827;">Receipt ID:</strong> ${escapeHtml(args.receiptId)}<br/>
          <strong style="color:#111827;">Creator:</strong> ${escapeHtml(args.creatorName)}
        </p>
      </div>

      <!-- Download button -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(args.downloadUrl)}"
               style="display:inline-block;background:linear-gradient(135deg,#7B3FE4,#00E0FF);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;">
              ⬇&nbsp; Download Now
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-align:center;">
        This link expires in <strong>${expiresHours} hours</strong>.
        If it expires, reply to this email and we'll send a fresh one.
      </p>
      <p style="margin:0;color:#d1d5db;font-size:11px;text-align:center;">
        Do not share this link — it is unique to your purchase.
      </p>

      ${emailFooter()}
    </div>
  </div>`;

  return sendEmail({ type: "EBOOK_DELIVERY", to: args.to, subject, html });
}
