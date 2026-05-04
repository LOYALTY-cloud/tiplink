import { SignJWT, jwtVerify } from "jose";

/**
 * Admin session JWT utilities.
 * Uses HMAC-SHA256 signed tokens with 8-hour expiry.
 * The secret is derived from ADMIN_JWT_SECRET env var (falls back to SUPABASE_SERVICE_ROLE_KEY).
 */

function getSecret(): Uint8Array {
  const raw = process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) throw new Error("ADMIN_JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set");
  return new TextEncoder().encode(raw);
}

export type AdminTokenPayload = {
  sub: string;       // user_id
  role: string;      // admin role
  admin_id: string;  // admin_id for display/logging
  name: string;      // display name
};

/**
 * Sign an admin session JWT with 8-hour expiry.
 */
export async function signAdminToken(payload: AdminTokenPayload): Promise<string> {
  return new SignJWT({
    role: payload.role,
    admin_id: payload.admin_id,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .setIssuer("1nelink-admin")
    .sign(getSecret());
}

/**
 * Verify and decode an admin session JWT.
 * Returns the payload or null if invalid/expired.
 */
export async function verifyAdminToken(
  token: string
): Promise<AdminTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: "1nelink-admin",
    });

    if (
      !payload.sub ||
      !payload.role ||
      !payload.admin_id ||
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.admin_id !== "string"
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      role: payload.role as string,
      admin_id: payload.admin_id as string,
      name: (payload.name as string) || "",
    };
  } catch {
    return null;
  }
}
