import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/emailService";

/**
 * POST /api/auth/forgot-password
 * Generates a recovery link via the admin API and sends a branded email
 * through Resend.  This avoids reliance on Supabase's built-in email
 * templates (whose Site URL might not match the running environment).
 */
export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Rate limit: 3/hour per email, 10/hour per IP
    const ip = getClientIp(req);
    const [byEmail, byIp] = await Promise.all([
      rateLimit(`forgot:${email.trim().toLowerCase()}`, 3, 3600),
      rateLimit(`forgot-ip:${ip}`, 10, 3600),
    ]);
    if (!byEmail.allowed || !byIp.allowed) {
      return NextResponse.json({ error: "Too many reset requests. Try again later." }, { status: 429 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(req.url).origin;

    // Generate a recovery link using the admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email.trim(),
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
      },
    });

    if (error || !data?.properties?.hashed_token) {
      // Log the real error but return generic success to prevent email enumeration
      if (error) console.error("[forgot-password]", error.message);
      return NextResponse.json({ ok: true });
    }

    // Build the reset URL through the server-side auth callback, which handles
    // token verification without PKCE constraints, then redirects to reset-password.
    const resetUrl = `${siteUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery`;

    // Send branded email via the centralized email service
    await sendEmail({
      type: "PASSWORD_RESET",
      to: email.trim(),
      subject: "Reset your 1NELINK password",
      html: `
<div style="background:#f7f7f8;padding:40px 20px;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e5e7eb;">

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr><td align="center" style="padding:30px 20px 10px 20px;">
        <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png"
             alt="1neLink" width="150"
             style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" />
      </td></tr>
      <tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr>
      <tr><td height="10"></td></tr>
    </table>

    <div style="text-align:center;margin-bottom:20px;">
      <h1 style="font-size:20px;color:#111827;margin:8px 0 0;">Reset your password</h1>
    </div>

    <p style="font-size:14px;color:#4b5563;text-align:center;margin-bottom:24px;">
      We received a request to reset the password for your 1neLink account.<br/>
      Click the button below to set a new password.
    </p>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetUrl}"
         style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
        Reset Password
      </a>
    </div>

    <p style="font-size:12px;color:#6b7280;text-align:center;">
      If the button doesn't work, copy and paste this link:
    </p>
    <p style="font-size:12px;color:#111827;text-align:center;word-break:break-all;">
      ${resetUrl}
    </p>

    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>

    <p style="font-size:11px;color:#9ca3af;text-align:center;">
      This link expires in 1 hour. If you didn't request a password reset,<br/>
      you can safely ignore this email.
    </p>
  </div>
</div>`,
    });

    // Always return success — never reveal whether the email exists
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[forgot-password]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
