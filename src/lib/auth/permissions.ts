/** Granular role permission map — single source of truth. */
export const PERMISSIONS = {
  refund:        ["owner", "co_owner", "super_admin", "finance_admin"],
  restrict:      ["owner", "co_owner", "super_admin", "finance_admin"],
  panic:         ["owner", "co_owner", "super_admin"],
  close:         ["owner", "co_owner", "super_admin"],
  risk_eval:     ["owner", "co_owner", "super_admin", "finance_admin"],
  view_admin:    ["owner", "co_owner", "super_admin", "finance_admin", "support_admin", "moderator", "security", "compliance", "analyst"],
  revenue:       ["owner", "co_owner", "super_admin", "analyst"],
  manage_staff:  ["owner", "co_owner"],
  staff:         ["owner", "co_owner", "super_admin", "finance_admin", "support_admin"],
  payroll:       ["owner", "super_admin"],
  activity:      ["owner", "co_owner", "super_admin", "security"],
  overrides:     ["owner", "co_owner", "super_admin", "finance_admin"],
  fraud:         ["owner", "co_owner", "super_admin", "finance_admin", "security", "compliance"],
  logs:          ["owner", "co_owner", "super_admin", "security"],
  // Marketplace / themes / store oversight
  marketplace:   ["owner", "co_owner", "super_admin", "moderator"],
  store:         ["owner", "co_owner", "super_admin", "moderator"],
  // Legal / compliance
  dmca:          ["owner", "co_owner", "super_admin", "compliance", "support_admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type Role =
  | "owner"
  | "co_owner"
  | "super_admin"
  | "security"
  | "finance_admin"
  | "support_admin"
  | "compliance"
  | "moderator"
  | "analyst"
  | "user"
  | "system";

export const ADMIN_ROLES: readonly string[] = [
  "owner",
  "co_owner",
  "super_admin",
  "security",
  "finance_admin",
  "support_admin",
  "compliance",
  "moderator",
  "analyst",
];
