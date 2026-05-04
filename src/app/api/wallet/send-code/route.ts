import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { walletUnlockEmail } from "@/lib/walletEmailTemplate";
import { rateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/emailService";
import crypto from "crypto";

// HMAC key for hashing OTP codes stored in app_metadata
// (so plaintext code isn't visible if someone inspects the JWT)
function hashCode(code: string): string {
  return crypto
    .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-hmac-key")
    .update(code)
    .digest("hex");
}

export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    // Rate limit: 3 code requests per 5 minutes per user
    const { allowed } = await rateLimit(`wallet-otp:${user.id}`, 3, 300);
    if (!allowed) {
      return NextResponse.json({ error: "Too many code requests. Please wait a few minutes." }, { status: 429 });
    }

    // Check existing OTP — if attempts >= 3 (locked out), don't reset the counter.
    // Uses app_metadata (admin Auth API) to bypass PostgREST RLS entirely.
    const { data: { user: fullUser } } = await supabaseAdmin.auth.admin.getUserById(user.id);
    const existingOtp = (fullUser?.app_metadata as Record<string, unknown> | undefined)?.wallet_otp as
      | { attempts?: number } | undefined;

    if (existingOtp && typeof existingOtp.attempts === "number" && existingOtp.attempts >= 3) {
      // Force logout — they're locked out, don't issue new codes
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: { wallet_otp: null },
      });
      await supabaseAdmin.auth.admin.signOut(user.id);
      return NextResponse.json(
        { error: "Too many failed attempts. You have been signed out.", forceLogout: true },
        { status: 403 }
      );
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Store HMAC-hashed code in app_metadata (admin-only write, bypasses RLS/PostgREST)
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
      console.error("wallet/send-code metadata update", metaErr);
      return NextResponse.json({ error: "Failed to generate code" }, { status: 500 });
    }

    // Validate email exists
    if (!user.email) {
      console.error("wallet/send-code: user has no email", user.id);
      return NextResponse.json({ error: "No email address on this account" }, { status: 400 });
    }

    // Send via email (with one retry for transient failures)
    const html = walletUnlockEmail(code);
    console.log(`[wallet/send-code] Sending OTP to ${user.email} (user ${user.id})`);

    let emailResult = await sendEmail({
      type: "WALLET_2FA",
      to: user.email,
      subject: "Your wallet unlock code",
      html,
    });

    // Retry once after 1s on transient failure
    if (!emailResult.success) {
      console.warn("[wallet/send-code] First attempt failed, retrying...", emailResult.error);
      await new Promise((r) => setTimeout(r, 1000));
      emailResult = await sendEmail({
        type: "WALLET_2FA",
        to: user.email,
        subject: "Your wallet unlock code",
        html,
      });
    }

    if (!emailResult.success) {
      console.error("wallet/send-code email failed after retry:", emailResult.error);
      return NextResponse.json({ error: "Failed to send verification code. Please try again." }, { status: 500 });
    }

    // Return masked email for UI
    const email = user.email ?? "";
    const [local, domain] = email.split("@");
    const masked = local.length > 2
      ? local[0] + "•".repeat(local.length - 2) + local[local.length - 1] + "@" + domain
      : local + "@" + domain;

    return NextResponse.json({ sent: true, maskedEmail: masked });
  } catch (e: unknown) {
    console.error("wallet/send-code", e);
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
