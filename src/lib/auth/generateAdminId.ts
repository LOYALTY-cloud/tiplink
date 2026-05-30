import crypto from "crypto";

export const ROLE_PREFIXES: Record<string, string> = {
  owner: "OWN",
  co_owner: "COW",
  super_admin: "ADM",
  security: "SEC",
  finance_admin: "FIN",
  compliance: "CMP",
  support_admin: "SUP",
  moderator: "MOD",
  analyst: "ANL",
};

/** Cryptographically secure random string from a character set */
function secureRandom(length: number, chars: string): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

/**
 * Generate an official-looking admin ID.
 * Format: PREFIX-6CHAR (e.g. ADM-9X4K2P, SUP-7H2L9A)
 */
export function generateAdminId(role: string): string {
  const prefix = ROLE_PREFIXES[role] ?? "ADM";
  return `${prefix}-${secureRandom(6, CHARS)}`;
}

/**
 * Generate a login passcode from an admin ID by appending extra random characters.
 * Format: ADMIN_ID-4CHAR (e.g. OWN-Y3R86L-KP4W)
 */
export function generateAdminPasscode(adminId: string): string {
  return `${adminId}-${secureRandom(4, CHARS)}`;
}

/** Check that an admin_id prefix matches the expected role. */
export function validateAdminIdPrefix(adminId: string, role: string): boolean {
  const expected = ROLE_PREFIXES[role];
  if (!expected) return false;
  return adminId.startsWith(`${expected}-`);
}
