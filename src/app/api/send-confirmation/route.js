import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  try {
    const { email, user_id } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // Rate limit: 5 confirmation emails per hour per email address
    const ip = getClientIp(req);
    const { allowed } = await rateLimit(`confirm:${normalizedEmail}`, 5, 3600);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Generate secure token.
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: deleteError } = await supabaseAdmin
      .from("email_verifications")
      .delete()
      .eq("email", normalizedEmail);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("email_verifications")
      .insert({
        email: normalizedEmail,
        user_id: user_id || null,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get("origin") || "https://1nelink.com";
    const confirmUrl = `${origin}/verify/callback?token=${token}`;

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "1neLink <receipts@1nelink.com>",
      to: normalizedEmail,
      subject: "Confirm your 1neLink account",
      html: `
<div style="background:#f7f7f8;padding:40px 20px;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e5e7eb;">

    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;letter-spacing:1px;">1NELINK</div>
      <h1 style="font-size:20px;color:#111827;margin:8px 0 0;">Confirm your email</h1>
    </div>

    <p style="font-size:14px;color:#4b5563;text-align:center;margin-bottom:24px;">
      You're almost ready to start receiving tips 💸<br/>
      Confirm your email to activate your account.
    </p>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${confirmUrl}"
         style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
        Confirm Email
      </a>
    </div>

    <p style="font-size:12px;color:#6b7280;text-align:center;">
      If the button doesn't work, copy and paste this link:
    </p>
    <p style="font-size:12px;color:#111827;text-align:center;word-break:break-all;">
      ${confirmUrl}
    </p>

    <div style="height:1px;background:#e5e7eb;margin:24px 0;"></div>

    <p style="font-size:11px;color:#9ca3af;text-align:center;">
      This email was sent to you because you created a 1neLink account.<br/>
      If this wasn't you, you can safely ignore this email.
    </p>

  </div>
</div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
