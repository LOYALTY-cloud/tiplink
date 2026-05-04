import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import crypto from "crypto";

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";

/**
 * POST — Generate a WebAuthn authentication challenge for biometric unlock.
 * Returns challenge options for navigator.credentials.get().
 */
export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    // Fetch registered credentials
    const { data: creds, error } = await supabaseAdmin
      .from("wallet_biometrics")
      .select("credential_id")
      .eq("user_id", user.id);

    if (error || !creds?.length) {
      return NextResponse.json({ error: "No biometric credentials registered" }, { status: 404 });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: creds.map((c: { credential_id: string }) => ({
        id: c.credential_id,
      })),
    });

    // Store challenge server-side (keyed by user_id, short TTL)
    await supabaseAdmin
      .from("wallet_biometric_challenges")
      .upsert(
        {
          user_id: user.id,
          challenge: options.challenge,
          expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 min
        },
        { onConflict: "user_id" }
      );

    return NextResponse.json(options);
  } catch (e: unknown) {
    console.error("wallet/biometric/challenge", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

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
