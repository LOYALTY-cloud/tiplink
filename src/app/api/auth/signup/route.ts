import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { trackLogin, generateDeviceHash } from "@/lib/loginTracker";
import { trustSignupDevice } from "@/lib/deviceRecognition";
import crypto from "crypto";

import { sendEmail } from "@/lib/emailService";
import { validateHandle, generateHandleSuggestions } from "@/lib/handleValidation";
import { validatePassword } from "@/lib/passwordPolicy";

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

    const pwError = validatePassword(password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }

    // Validate display name
    const trimmedName = (displayName || "").trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }
    if (trimmedName.length > MAX_DISPLAY_NAME) {
      return NextResponse.json({ error: `Display name must be ${MAX_DISPLAY_NAME} characters or less` }, { status: 400 });
    }

    // Validate handle (format + reserved + offensive)
    const validation = validateHandle(handle || "");
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, field: "handle" },
        { status: 400 }
      );
    }
    const cleanHandle = validation.handle;

    // Check handle uniqueness BEFORE creating the user (case-insensitive)
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("handle", cleanHandle)
      .maybeSingle();

    if (existing) {
      // Generate suggestions for the taken handle
      const suggestions = generateHandleSuggestions(cleanHandle);
      const { data: takenRows } = await supabaseAdmin
        .from("profiles")
        .select("handle")
        .in("handle", suggestions);
      const takenSet = new Set(takenRows?.map((r) => r.handle) ?? []);
      const available = suggestions.filter((s) => !takenSet.has(s));

      return NextResponse.json(
        {
          error: "That handle is already taken. Try another one.",
          field: "handle",
          suggestions: available.slice(0, 5),
        },
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
      return NextResponse.json({ error: "Signup failed" }, { status: 400 });
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

    // Send confirmation email via custom token (reliable — doesn't depend on generateLink)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1nelink.com";
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Clear any stale tokens for this email, then insert the new one
      await supabaseAdmin.from("email_verifications").delete().eq("email", normalizedEmail);
      const { error: tokenErr } = await supabaseAdmin.from("email_verifications").insert({
        email: normalizedEmail,
        user_id: authData.user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      if (tokenErr) {
        console.error("[signup] Failed to insert verification token:", tokenErr);
      } else {
        const confirmUrl = `${siteUrl}/verify/callback?token=${token}`;
        await sendEmail({
          type: "EMAIL_VERIFICATION",
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
    } catch (emailErr) {
      console.error("[signup] Confirmation email failed:", emailErr);
    }

    // Track signup for fraud analytics
    const userAgent = req.headers.get("user-agent") || "";
    const deviceHash = generateDeviceHash(ip, userAgent);
    trackLogin({ userId: authData.user.id, eventType: "signup", ip, userAgent, deviceHash, success: true });

    // Pre-trust the signup device so first login doesn't trigger "new device" alert
    trustSignupDevice(authData.user.id, userAgent, ip).catch(() => {});

    return NextResponse.json({ ok: true, userId: authData.user.id });
  } catch (e: unknown) {
    console.error("[signup]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
