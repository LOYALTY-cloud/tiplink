import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { walletDisableCodeEmail, walletSecurityAlertEmail } from "@/lib/walletEmailTemplate";
import { sendEmail, sendEmailAsync } from "@/lib/emailService";
import crypto from "crypto";

// HMAC key for hashing OTP codes — must match wallet/send-code and wallet/verify-code
function hashCode(code: string): string {
  return crypto
    .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-hmac-key")
    .update(code)
    .digest("hex");
}

/**
 * POST — Toggle wallet 2FA.
 *
 * Enable:  { action: "enable" }               → instant, sends confirmation email
 * Disable: { action: "disable", code: "123456" } → requires valid OTP, sends alert email
 * Send disable code: { action: "send-disable-code" } → sends OTP for disable flow
 */
export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const body = await req.json();
    const action = body.action as string;

    /* ── ENABLE (instant) ──────────────────────────── */
    if (action === "enable") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ wallet_2fa_enabled: true })
        .eq("user_id", user.id);

      if (error) {
        console.error("wallet-2fa enable", error);
        return NextResponse.json({ error: "Failed to enable" }, { status: 500 });
      }

      // Confirmation email
      sendSecurityEmail(
        user.email!,
        "Wallet protection enabled",
        "Wallet 2FA has been enabled on your 1neLink account. You'll need a 6-digit code to access your wallet.",
        "If this wasn't you, change your password immediately and contact support."
      );

      return NextResponse.json({ success: true, enabled: true });
    }

    /* ── SEND DISABLE CODE ─────────────────────────── */
    if (action === "send-disable-code") {
      const code = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

      const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          wallet_otp: {
            code_hash: hashCode(code),
            expires_at: expiresAt,
            attempts: 0,
            created_at: new Date().toISOString(),
          },
        },
      });

      if (metaErr) {
        console.error("wallet-2fa send-disable-code", metaErr);
        return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
      }

      await sendEmail({
        type: "WALLET_2FA_DISABLE",
        to: user.email!,
        subject: "Confirm disabling wallet protection",
        html: walletDisableCodeEmail(code),
      });

      // Return masked email
      const email = user.email ?? "";
      const [local, domain] = email.split("@");
      const masked = local.length > 2
        ? local[0] + "•".repeat(local.length - 2) + local[local.length - 1] + "@" + domain
        : local + "@" + domain;

      return NextResponse.json({ sent: true, maskedEmail: masked });
    }

    /* ── DISABLE (requires OTP) ────────────────────── */
    if (action === "disable") {
      const code = String(body.code ?? "").trim();
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
      }

      const { data: { user: fullUser }, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(user.id);

      if (fetchErr || !fullUser) {
        return NextResponse.json({ error: "No code found. Request a new one." }, { status: 400 });
      }

      const otp = (fullUser.app_metadata as Record<string, unknown> | undefined)?.wallet_otp as
        | { code_hash?: string; expires_at?: string; attempts?: number } | null | undefined;

      if (!otp?.code_hash) {
        return NextResponse.json({ error: "No code found. Request a new one." }, { status: 400 });
      }

      const attempts = typeof otp.attempts === "number" ? otp.attempts : 0;

      if (attempts >= 3) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { wallet_otp: null } });
        return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 403 });
      }

      if (otp.expires_at && new Date(otp.expires_at) < new Date()) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { wallet_otp: null } });
        return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 400 });
      }

      const submittedHash = hashCode(code);
      const valid = crypto.timingSafeEqual(
        Buffer.from(submittedHash, "utf8"),
        Buffer.from(otp.code_hash, "utf8")
      );

      if (!valid) {
        const newAttempts = attempts + 1;
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          app_metadata: { wallet_otp: { ...otp, attempts: newAttempts } },
        });

        const remaining = 3 - newAttempts;
        return NextResponse.json(
          { error: `Incorrect code · ${remaining} attempt${remaining === 1 ? "" : "s"} left` },
          { status: 400 }
        );
      }

      // Code valid — disable 2FA
      await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { wallet_otp: null } });
      await supabaseAdmin
        .from("profiles")
        .update({ wallet_2fa_enabled: false })
        .eq("user_id", user.id);

      // Also remove biometric credentials when disabling
      await supabaseAdmin
        .from("wallet_biometrics")
        .delete()
        .eq("user_id", user.id);

      // Alert email
      sendSecurityEmail(
        user.email!,
        "⚠️ Wallet protection disabled",
        "Wallet 2FA has been disabled on your 1neLink account. Your wallet is no longer protected by an email code.",
        "If this wasn't you, re-enable protection immediately and contact support at support@1nelink.com."
      );

      return NextResponse.json({ success: true, enabled: false });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: unknown) {
    console.error("settings/wallet-2fa", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ── helpers ────────────────────────────────────────── */

function extractToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

async function getUser(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Fire-and-forget security notification email */
function sendSecurityEmail(to: string, subject: string, message: string, warning: string) {
  sendEmailAsync({
    type: "WALLET_2FA_ENABLED",
    to,
    subject,
    html: walletSecurityAlertEmail(subject, message, warning),
  });
}
