import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TokenPayload = {
  uid: string;
  email: string;
  exp: number;
  purpose: "elite_creator_set_password";
};

function verifySetupToken(token: string): TokenPayload | null {
  const secret =
    process.env.SET_PASSWORD_LINK_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev_only_fallback_secret";

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [data, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (sig !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as TokenPayload;
    if (payload.purpose !== "elite_creator_set_password") return null;
    if (!payload.uid || !payload.email || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  const common = [
    "password", "12345678", "123456789", "1234567890", "qwerty123", "password1", "iloveyou",
    "sunshine1", "princess1", "football1", "trustno1", "superman1", "whatever1", "welcome1",
    "password123", "qwertyui", "asdfghjk", "p@ssw0rd", "passw0rd", "admin123", "welcome123", "changeme",
  ];
  if (common.includes(password.toLowerCase())) return "This password is too common. Choose something stronger.";
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as { setupToken?: string; password?: string } | null;
    const setupToken = body?.setupToken;
    const password = body?.password;

    if (!setupToken || typeof setupToken !== "string" || !password || typeof password !== "string") {
      return NextResponse.json({ error: "Missing setup token or password" }, { status: 400 });
    }

    const pwErr = validatePassword(password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

    const payload = verifySetupToken(setupToken);
    if (!payload) return NextResponse.json({ error: "Set-password link is invalid or expired." }, { status: 400 });

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(payload.uid, {
      password,
      email_confirm: true,
    });

    if (updateErr) {
      console.error("set-password complete updateUserById:", updateErr);
      return NextResponse.json({ error: "Unable to set password. Please request a new link." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, email: payload.email });
  } catch (e) {
    console.error("set-password complete POST:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
