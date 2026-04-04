import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

type SendTipReceiptArgs = {
  to: string;
  receiptId: string;
  amountUsd: string;
  creatorName: string;
  createdAt: string;
};

export async function sendTipReceipt(args: SendTipReceiptArgs) {
  const from = process.env.RECEIPTS_FROM_EMAIL!;
  const subject = `1NELINK receipt -- ${args.amountUsd}`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="text-align:center;margin-bottom:16px;"><img src="https://1nelink.com/1nelink-logo.png" alt="1neLink" width="60" height="60" style="border-radius:14px;" /></div>
      <h2 style="margin:0;color:#111827;">1NELINK Receipt</h2>
      <p style="margin:10px 0 18px;color:#4b5563;">
        Thanks for your private support.
      </p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
        <p style="margin:0;color:#111827;"><strong>Receipt ID:</strong> ${args.receiptId}</p>
        <p style="margin:10px 0 0;color:#111827;"><strong>Creator:</strong> ${args.creatorName}</p>
        <p style="margin:10px 0 0;color:#111827;"><strong>Amount:</strong> ${args.amountUsd}</p>
        <p style="margin:10px 0 0;color:#111827;"><strong>Date:</strong> ${args.createdAt}</p>
        <p style="margin:10px 0 0;color:#6b7280;font-size:12px;">
          This support is private. The creator will not see your email.
        </p>
      </div>

      <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
        Need help? Reply to this email.
      </p>
    </div>
  </div>`;

  return resend.emails.send({ from, to: args.to, subject, html });
}
