export const ROLE_PREFIXES: Record<string, string> = {
  owner: "OWN",
  super_admin: "ADM",
  finance_admin: "FIN",
  support_admin: "SUP",
};

/**
 * Generate an official-looking admin ID.
 * Format: PREFIX-6CHAR (e.g. ADM-9X4K2P, SUP-7H2L9A)
 */
export function generateAdminId(role: string): string {
  const prefix = ROLE_PREFIXES[role] ?? "ADM";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  let random = "";
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${random}`;
}

/**
 * Generate a login passcode from an admin ID by appending extra random characters.
 * Format: ADMIN_ID-4CHAR (e.g. OWN-Y3R86L-KP4W)
 */
export function generateAdminPasscode(adminId: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${adminId}-${suffix}`;
}

/** Check that an admin_id prefix matches the expected role. */
export function validateAdminIdPrefix(adminId: string, role: string): boolean {
  const expected = ROLE_PREFIXES[role];
  if (!expected) return false;
  return adminId.startsWith(`${expected}-`);
}
