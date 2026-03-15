import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  throw new Error("Missing RESEND_API_KEY");
}

const resend = new Resend(resendApiKey);

export async function sendTipReceiptEmail(args: {
  to: string;
  receiptId: string;
  amount: string; // already formatted
  creatorName: string; // handle or display name
  createdAt: string; // formatted
}) {
  const from = process.env.RECEIPTS_FROM_EMAIL;
  if (!from) {
    throw new Error("Missing RECEIPTS_FROM_EMAIL");
  }
  const subject = `Your TIPLINK receipt — ${args.amount}`;

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
    <h2 style="margin:0 0 12px;">TIPLINK Receipt</h2>
    <p style="margin:0 0 12px;">Thanks for your private support.</p>

    <div style="border:1px solid #E5E7EB; border-radius:16px; padding:16px; background:#F9FAFB;">
      <p style="margin:0;"><strong>Receipt ID:</strong> ${args.receiptId}</p>
      <p style="margin:8px 0 0;"><strong>Creator:</strong> ${args.creatorName}</p>
      <p style="margin:8px 0 0;"><strong>Amount:</strong> ${args.amount}</p>
      <p style="margin:8px 0 0;"><strong>Date:</strong> ${args.createdAt}</p>
      <p style="margin:8px 0 0; color:#6B7280; font-size:12px;">
        This support is private. The creator wont see your email.
      </p>
    </div>

    <p style="margin:14px 0 0; color:#6B7280; font-size:12px;">
      Need help? Reply to this email.
    </p>
  </div>
  `;

  return await resend.emails.send({
    from,
    to: args.to,
    subject,
    html,
  });
}
