import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";

/**
 * POST — Verify a WebAuthn authentication assertion.
 * Body: The full AuthenticationResponseJSON from @simplewebauthn/browser.
 * On success, sets wallet_unlocked_at on the profile (server-side 2FA gate).
 */
export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const body = await req.json();

    // Retrieve the stored challenge
    const { data: challengeRow, error: challengeErr } = await supabaseAdmin
      .from("wallet_biometric_challenges")
      .select("challenge, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (challengeErr || !challengeRow) {
      return NextResponse.json({ error: "No pending challenge. Request a new one." }, { status: 400 });
    }

    // Check expiry
    if (new Date(challengeRow.expires_at) < new Date()) {
      await supabaseAdmin.from("wallet_biometric_challenges").delete().eq("user_id", user.id);
      return NextResponse.json({ error: "Challenge expired. Request a new one." }, { status: 400 });
    }

    // Find the credential used for this assertion
    const credentialId = body.id;
    const { data: credRow, error: credErr } = await supabaseAdmin
      .from("wallet_biometrics")
      .select("credential_id, public_key")
      .eq("user_id", user.id)
      .eq("credential_id", credentialId)
      .maybeSingle();

    if (credErr || !credRow) {
      return NextResponse.json({ error: "Unknown credential" }, { status: 400 });
    }

    // Verify the assertion
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credRow.credential_id,
        publicKey: Buffer.from(credRow.public_key, "base64url"),
        counter: 0, // We don't track counters; accept any
      },
    });

    // Clean up challenge regardless of result
    await supabaseAdmin.from("wallet_biometric_challenges").delete().eq("user_id", user.id);

    if (!verification.verified) {
      return NextResponse.json({ error: "Biometric verification failed" }, { status: 403 });
    }

    // Persist unlock state server-side (same as OTP verify)
    await supabaseAdmin
      .from("profiles")
      .update({ wallet_unlocked_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({ verified: true });
  } catch (e: unknown) {
    console.error("wallet/biometric/verify", e);
    return NextResponse.json({ error: "Biometric verification failed" }, { status: 500 });
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
