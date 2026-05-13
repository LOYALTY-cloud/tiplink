/** Granular role permission map — single source of truth. */
export const PERMISSIONS = {
  refund:        ["owner", "super_admin", "finance_admin"],
  restrict:      ["owner", "super_admin", "finance_admin"],
  panic:         ["owner", "super_admin"],
  close:         ["owner", "super_admin"],
  risk_eval:     ["owner", "super_admin", "finance_admin"],
  view_admin:    ["owner", "super_admin", "finance_admin", "support_admin", "moderator"],
  revenue:       ["owner", "super_admin"],
  manage_staff:  ["owner"],
  staff:         ["owner", "super_admin", "finance_admin", "support_admin"],
  payroll:       ["owner", "super_admin"],
  activity:      ["owner", "super_admin"],
  overrides:     ["owner", "super_admin", "finance_admin"],
  fraud:         ["owner", "super_admin", "finance_admin"],
  logs:          ["owner", "super_admin"],
  // Marketplace / themes / store oversight
  marketplace:   ["owner", "super_admin", "moderator"],
  store:         ["owner", "super_admin", "moderator"],
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type Role = "owner" | "super_admin" | "finance_admin" | "support_admin" | "moderator" | "user" | "system";

export const ADMIN_ROLES: readonly string[] = [
  "owner",
  "super_admin",
  "finance_admin",
  "support_admin",
  "moderator",
];
