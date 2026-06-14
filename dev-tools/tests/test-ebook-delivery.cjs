const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  // 1. Generate 48-hour signed URL
  const { data: signed, error: sErr } = await sb.storage
    .from("digital-products")
    .createSignedUrl("MAYKN_Second_Life_Beginner_Resource_Guide.pdf", 48 * 3600, { download: true });

  if (sErr || !signed?.signedUrl) {
    console.error("Failed to generate signed URL:", sErr?.message);
    process.exit(1);
  }
  console.log("✓ Signed URL generated");

  // 2. Send ebook delivery email
  const { data, error } = await resend.emails.send({
    from: "1neLink Receipts <receipts@1nelink.com>",
    to: [process.env.TEST_EMAIL || "dgofr3836@gmail.com"],
    subject: "Your download: GOLDI MAYKN RESOURCE GUIDE",
    html: `
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

        <h2 style="margin:0 0 4px;color:#111827;">Your download is ready &#x1F389;</h2>
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
          Thanks for supporting <strong>@gfebook</strong>. Your file is ready below.
        </p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Digital Product</p>
          <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111827;">GOLDI MAYKN RESOURCE GUIDE</p>
          <p style="margin:0;font-size:13px;color:#6b7280;">
            <strong style="color:#111827;">Amount paid:</strong> $9.99<br/>
            <strong style="color:#111827;">Receipt ID:</strong> TEST-DELIVERY<br/>
            <strong style="color:#111827;">Creator:</strong> @gfebook
          </p>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr><td align="center">
            <a href="${signed.signedUrl}"
               style="display:inline-block;background:linear-gradient(135deg,#7B3FE4,#00E0FF);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;">
              &#x2B07;&nbsp; Download Now
            </a>
          </td></tr>
        </table>

        <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-align:center;">
          This link expires in <strong>48 hours</strong>. If it expires, reply to this email for a new one.
        </p>
        <p style="margin:0;color:#d1d5db;font-size:11px;text-align:center;">
          Do not share this link — it is unique to your purchase.
        </p>

        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">1neLink &bull; receipts@1nelink.com</p>
        </div>
      </div>
    </div>`,
  });

  if (error) {
    console.error("Email send failed:", JSON.stringify(error, null, 2));
    process.exit(1);
  }
  console.log("✓ Email sent! Resend ID:", data?.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
