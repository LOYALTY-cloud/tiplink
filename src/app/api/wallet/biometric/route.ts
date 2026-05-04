import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyRegistrationResponse, generateRegistrationOptions } from "@simplewebauthn/server";

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const RP_NAME = process.env.WEBAUTHN_RP_NAME || "1neLink";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";

/**
 * POST — Register a WebAuthn credential after successful OTP unlock.
 * Step 1: Client calls POST with { action: "options" } → returns registration options
 * Step 2: Client calls POST with { action: "verify", attestation: ... } → verifies and stores
 */
export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const body = await req.json();
    const action = String(body.action ?? "verify");

    // ── Step 1: Generate registration options ──
    if (action === "options") {
      // Fetch existing credentials to exclude
      const { data: existing } = await supabaseAdmin
        .from("wallet_biometrics")
        .select("credential_id")
        .eq("user_id", user.id);

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: user.email ?? user.id,
        userDisplayName: user.email ?? "User",
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
        excludeCredentials: (existing ?? []).map((c: { credential_id: string }) => ({
          id: c.credential_id,
        })),
      });

      // Store challenge for verification step
      await supabaseAdmin
        .from("wallet_biometric_challenges")
        .upsert(
          {
            user_id: user.id,
            challenge: options.challenge,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          },
          { onConflict: "user_id" }
        );

      return NextResponse.json(options);
    }

    // ── Step 2: Verify attestation response and store credential ──
    const attestation = body.attestation;
    if (!attestation) {
      return NextResponse.json({ error: "Missing attestation response" }, { status: 400 });
    }

    // Retrieve stored challenge
    const { data: challengeRow } = await supabaseAdmin
      .from("wallet_biometric_challenges")
      .select("challenge, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!challengeRow) {
      return NextResponse.json({ error: "No pending registration challenge. Start over." }, { status: 400 });
    }

    if (new Date(challengeRow.expires_at) < new Date()) {
      await supabaseAdmin.from("wallet_biometric_challenges").delete().eq("user_id", user.id);
      return NextResponse.json({ error: "Challenge expired. Start over." }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    // Clean up challenge
    await supabaseAdmin.from("wallet_biometric_challenges").delete().eq("user_id", user.id);

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Credential verification failed" }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;

    // Store verified credential
    const { error } = await supabaseAdmin
      .from("wallet_biometrics")
      .upsert(
        {
          user_id: user.id,
          credential_id: credential.id,
          public_key: Buffer.from(credential.publicKey).toString("base64url"),
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,credential_id" }
      );

    if (error) {
      console.error("wallet/biometric/register", error);
      return NextResponse.json({ error: "Failed to save credential" }, { status: 500 });
    }

    return NextResponse.json({ registered: true });
  } catch (e: unknown) {
    console.error("wallet/biometric/register", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * GET — Check if user has biometric credentials registered.
 */
export async function GET(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const { data, error } = await supabaseAdmin
      .from("wallet_biometrics")
      .select("credential_id")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: "Failed to check biometric registration." }, { status: 500 });
    }

    return NextResponse.json({
      registered: (data?.length ?? 0) > 0,
      credentialIds: (data ?? []).map((r: { credential_id: string }) => r.credential_id),
    });
  } catch (e: unknown) {
    console.error("wallet/biometric", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE — Remove biometric credentials.
 */
export async function DELETE(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    await supabaseAdmin
      .from("wallet_biometrics")
      .delete()
      .eq("user_id", user.id);

    return NextResponse.json({ removed: true });
  } catch (e: unknown) {
    console.error("wallet/biometric/delete", e);
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
