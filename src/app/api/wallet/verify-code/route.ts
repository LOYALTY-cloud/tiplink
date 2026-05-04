import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

const MAX_ATTEMPTS = 3;

// Must match the HMAC key used in send-code
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

    const body = await req.json();
    const code = String(body.code ?? "").trim();

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
    }

    // Read OTP from app_metadata (admin Auth API — bypasses PostgREST/RLS)
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

    // Already exceeded attempts — force logout
    if (attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { wallet_otp: null } });
      await supabaseAdmin.auth.admin.signOut(user.id);
      return NextResponse.json(
        { error: "Too many failed attempts. You have been signed out.", forceLogout: true },
        { status: 403 }
      );
    }

    // Constant-time comparison of HMAC hashes to prevent timing side-channels
    const submittedHash = hashCode(code);
    const valid = crypto.timingSafeEqual(
      Buffer.from(submittedHash, "utf8"),
      Buffer.from(otp.code_hash, "utf8")
    );

    // Check expiry (after comparison to avoid timing leaks)
    if (otp.expires_at && new Date(otp.expires_at) < new Date()) {
      await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { wallet_otp: null } });
      return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 400 });
    }

    if (!valid) {
      const newAttempts = attempts + 1;

      // Increment attempt counter in app_metadata
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: { wallet_otp: { ...otp, attempts: newAttempts } },
      });

      // If this was the 3rd failure, force logout across all devices
      if (newAttempts >= MAX_ATTEMPTS) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { wallet_otp: null } });
        await supabaseAdmin.auth.admin.signOut(user.id);
        return NextResponse.json(
          { error: "Too many failed attempts. You have been signed out.", forceLogout: true },
          { status: 403 }
        );
      }

      const remaining = MAX_ATTEMPTS - newAttempts;
      return NextResponse.json(
        { error: `Incorrect code · ${remaining} attempt${remaining === 1 ? "" : "s"} left`, remaining },
        { status: 400 }
      );
    }

    // Code valid — clear OTP and persist unlock state server-side
    await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { wallet_otp: null } });

    // Record unlock timestamp so API routes can verify 2FA was completed
    await supabaseAdmin
      .from("profiles")
      .update({ wallet_unlocked_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({ verified: true });
  } catch (e: unknown) {
    console.error("wallet/verify-code", e);
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
