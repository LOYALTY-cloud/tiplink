/** Granular role permission map — single source of truth. */
export const PERMISSIONS = {
  refund:      ["owner", "super_admin", "finance_admin"],
  restrict:    ["owner", "super_admin"],
  panic:       ["owner", "super_admin"],
  close:       ["owner", "super_admin"],
  risk_eval:   ["owner", "super_admin", "finance_admin"],
  view_admin:  ["owner", "super_admin", "finance_admin", "support_admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type Role = "owner" | "super_admin" | "finance_admin" | "support_admin" | "user" | "system";

export const ADMIN_ROLES: readonly string[] = [
  "owner",
  "super_admin",
  "finance_admin",
  "support_admin",
];
