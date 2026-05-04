import { NextResponse } from "next/server";
import { getResend } from "@/lib/email";
import { emailFooter } from "@/lib/email/footer";
import { sendTipReceipt } from "@/lib/email/sendTipReceipt";

export const runtime = "nodejs";

const LOGO_URL = "https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png";
const DASHBOARD_URL = "https://1nelink.com/dashboard";
const APP_URL = "https://1nelink.com";

function wrap(title: string, inner: string, ctaLabel: string, ctaHref: string, ctaColor: string, titleColor = "#111827"): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
        <tr><td align="center" style="padding:30px 20px 10px 20px;">
          <img src="${LOGO_URL}" alt="1neLink" width="150" style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" />
        </td></tr>
        <tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr>
        <tr><td height="10"></td></tr>
      </table>
      <p style="margin:16px 0 8px;font-size:20px;color:${titleColor};font-weight:700;">${title}</p>
      ${inner}
      <a href="${ctaHref}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:${ctaColor};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        ${ctaLabel}
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You can manage notification preferences in your
        <a href="${DASHBOARD_URL}" style="color:#6b7280;">Settings</a>.
      </p>
      ${emailFooter()}
    </div>
  </div>`;
}

/**
 * POST /api/test/email-all
 * Body: { "email": "you@example.com" }
 *
 * Sends test emails for: tip received, account registration,
 * account suspended, account closed, and tip receipt.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const body = await req.json();
  const email = body.email;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required in body" }, { status: 400 });
  }

  const from = process.env.EMAIL_FROM || "1neLink <no-reply@1nelink.com>";
  const receiptFrom = process.env.RECEIPTS_FROM_EMAIL || from;
  const resend = getResend();
  const results: { name: string; ok: boolean; error?: string }[] = [];

  // 1. Tip Received (creator notification)
  {
    const html = wrap(
      "You just received a tip! 💸",
      `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:12px 0;text-align:center;">
        <p style="margin:0;color:#166534;font-size:28px;font-weight:700;">$15.00</p>
        <p style="margin:8px 0 0;color:#166534;font-size:14px;">received</p>
      </div>`,
      "View Dashboard →", DASHBOARD_URL, "#111827"
    );
    try {
      await resend.emails.send({ from, to: email, subject: "[TEST] You just received a tip! 💸", html });
      results.push({ name: "1. Tip Received", ok: true });
    } catch (e: any) { results.push({ name: "1. Tip Received", ok: false, error: e.message }); }
  }

  // 2. Tip Receipt (tipper gets this)
  {
    try {
      await sendTipReceipt({
        to: email,
        receiptId: `TL-TEST-${Date.now().toString(36).toUpperCase()}`,
        amountUsd: "$15.00",
        creatorName: "TestCreator",
        createdAt: new Date().toLocaleString(),
      });
      results.push({ name: "2. Tip Receipt", ok: true });
    } catch (e: any) { results.push({ name: "2. Tip Receipt", ok: false, error: e.message }); }
  }

  // 3. Account Registration (confirmation email)
  {
    const confirmUrl = `${APP_URL}/verify/callback?token=test-token-abc123`;
    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
          <tr><td align="center" style="padding:30px 20px 10px 20px;">
            <img src="${LOGO_URL}" alt="1neLink" width="150" style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" />
          </td></tr>
          <tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr>
          <tr><td height="10"></td></tr>
        </table>
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="font-size:20px;color:#111827;margin:8px 0 0;">Confirm your email</h1>
        </div>
        <p style="font-size:14px;color:#4b5563;text-align:center;margin-bottom:24px;">
          You're almost ready to start receiving tips 💸<br/>
          Confirm your email to activate your account.
        </p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${confirmUrl}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
            Confirm Email
          </a>
        </div>
        <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>
        <p style="font-size:11px;color:#9ca3af;text-align:center;">
          This email was sent to you because you created a 1neLink account.<br/>
          If this wasn't you, you can safely ignore this email.
        </p>
        ${emailFooter()}
      </div>
    </div>`;
    try {
      await resend.emails.send({ from, to: email, subject: "[TEST] Confirm your 1neLink account", html });
      results.push({ name: "3. Account Registration", ok: true });
    } catch (e: any) { results.push({ name: "3. Account Registration", ok: false, error: e.message }); }
  }

  // 4. Account Suspended
  {
    const html = wrap(
      "⚠️ Account Suspended",
      `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#991b1b;font-size:16px;">Account Suspended</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your account has been suspended due to a violation of our policies.
        </p>
        <p style="margin:12px 0 0;color:#111;font-size:14px;">
          <strong>Reason:</strong> Suspicious activity detected on your account
        </p>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">
          If you believe this was a mistake, please contact support@1nelink.com for assistance.
        </p>
      </div>`,
      "Contact Support", `${APP_URL}/dashboard`, "#000000", "#dc2626"
    );
    try {
      await resend.emails.send({ from, to: email, subject: "[TEST] ⚠️ Account Suspended", html });
      results.push({ name: "4. Account Suspended", ok: true });
    } catch (e: any) { results.push({ name: "4. Account Suspended", ok: false, error: e.message }); }
  }

  // 5. Account Closed
  {
    const html = wrap(
      "⚠️ Account Closed",
      `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#111;font-size:16px;">Account Closed</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your account has been closed.
        </p>
        <p style="margin:12px 0 0;color:#111;font-size:14px;">
          <strong>Reason:</strong> Violation of our Terms of Service
        </p>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">
          If you have a remaining balance, you can still withdraw your funds from your wallet.
          For questions, contact support@1nelink.com.
        </p>
      </div>`,
      "Go to Wallet", `${APP_URL}/dashboard`, "#000000", "#dc2626"
    );
    try {
      await resend.emails.send({ from, to: email, subject: "[TEST] ⚠️ Account Closed", html });
      results.push({ name: "5. Account Closed", ok: true });
    } catch (e: any) { results.push({ name: "5. Account Closed", ok: false, error: e.message }); }
  }

  return NextResponse.json({ success: true, sent_to: email, results });
}
