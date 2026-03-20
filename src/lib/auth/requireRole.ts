import type { Permission } from "./permissions";
import { PERMISSIONS } from "./permissions";

/**
 * Throw if the caller's role is not in the allowed list for the given permission.
 * Usage:  requireRole(role, "refund")   — uses PERMISSIONS map
 *   or:   requireRole(role, ["owner", "super_admin"])  — inline list
 */
export function requireRole(
  role: string | null | undefined,
  permissionOrList: Permission | readonly string[],
): void {
  const allowed = Array.isArray(permissionOrList)
    ? permissionOrList
    : PERMISSIONS[permissionOrList as Permission];

  if (!role || !allowed.includes(role as typeof allowed[number])) {
    throw new Error("FORBIDDEN");
  }
}
