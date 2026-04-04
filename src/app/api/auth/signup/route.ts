import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { trackLogin } from "@/lib/loginTracker";

const resend = new Resend(process.env.RESEND_API_KEY!);

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
const MAX_DISPLAY_NAME = 50;

/**
 * POST /api/auth/signup
 * Server-side signup. The DB trigger on auth.users automatically creates
 * profiles, wallets, and user_settings rows.
 * After user creation we update the profile with display_name, handle,
 * and a 2-week handle lock.
 */
export async function POST(req: Request) {
  try {
    const { email, password, displayName, handle } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Rate limit: 5 signups per hour per IP
    const ip = getClientIp(req);
    const { allowed } = await rateLimit(`signup:${ip}`, 5, 3600);
    if (!allowed) {
      return NextResponse.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Validate display name
    const trimmedName = (displayName || "").trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }
    if (trimmedName.length > MAX_DISPLAY_NAME) {
      return NextResponse.json({ error: `Display name must be ${MAX_DISPLAY_NAME} characters or less` }, { status: 400 });
    }

    // Validate handle
    const cleanHandle = (handle || "").trim().toLowerCase();
    if (!HANDLE_RE.test(cleanHandle)) {
      return NextResponse.json(
        { error: "Handle must be 3-30 characters, letters/numbers/underscores only", field: "handle" },
        { status: 400 }
      );
    }

    // Check handle uniqueness BEFORE creating the user
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("handle", cleanHandle)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "That handle is already taken. Try another one.", field: "handle" },
        { status: 409 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Create auth user — the DB trigger handles profiles, wallets, user_settings
    const { data: authData, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: false,
      });

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    // Update the profile with display_name, handle, and 2-week lock
    const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("profiles")
      .update({
        display_name: trimmedName,
        handle: cleanHandle,
        handle_locked_until: twoWeeksFromNow,
      })
      .eq("user_id", authData.user.id);

    // Generate a verification link and send it via Resend
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
    const { data: linkData, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email: normalizedEmail,
        password,
        options: { redirectTo: `${siteUrl}/verify/callback` },
      });

    if (!linkErr && linkData?.properties?.action_link) {
      const confirmUrl = linkData.properties.action_link;
      await resend.emails.send({
        from: process.env.EMAIL_FROM || "1neLink <receipts@1nelink.com>",
        to: normalizedEmail,
        subject: "Verify your 1NELINK account",
        html: `
<div style="background:#f7f7f8;padding:40px 20px;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e5e7eb;">

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr><td align="center" style="padding:30px 20px 10px 20px;"><img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="150" style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" /></td></tr><tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr><tr><td height="10"></td></tr></table>
    <div style="text-align:center;margin-bottom:20px;">
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
    }

    // Track signup for fraud analytics
    trackLogin({ userId: authData.user.id, eventType: "signup", ip, userAgent: req.headers.get("user-agent") || "", success: true });

    return NextResponse.json({ ok: true, userId: authData.user.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
