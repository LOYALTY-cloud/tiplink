/**
 * Withdrawal validation rules.
 * State-driven: account_status is the single source of truth.
 *
 *   active          → full access
 *   closed          → can withdraw remaining funds (exit mode)
 *   restricted      → blocked, must verify identity
 *   suspended       → blocked
 *   closed_finalized→ blocked (no funds remain)
 */

type WithdrawalUser = {
  account_status?: string | null;
  payout_hold_until?: string | null;
  daily_withdrawn?: number;
  restricted_until?: string | null;
};

type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateWithdrawal(
  user: WithdrawalUser,
  amount: number
): ValidationResult {
  const status = user.account_status ?? "active";

  // Restricted = BLOCKED — unless restriction has expired (restricted_until passed)
  if (status === "restricted") {
    if (user.restricted_until && new Date(user.restricted_until) <= new Date()) {
      // Restriction expired — allow (caller should auto-unlock account_status)
      return { ok: true, expired_restriction: true } as ValidationResult & { expired_restriction?: boolean };
    }
    return { ok: false, reason: "Account restricted — verify your identity to withdraw" };
  }

  // Suspended = BLOCKED
  if (status === "suspended") {
    return { ok: false, reason: "Account suspended" };
  }

  // Finalized = BLOCKED — no funds remain
  if (status === "closed_finalized") {
    return { ok: false, reason: "Account fully closed" };
  }

  // Closed = ALLOWED — they can still withdraw existing funds
  // Active  = ALLOWED — normal operation
  // (no block needed for "closed" or "active")

  // Hold period (e.g., 24h after receiving tips)
  if (user.payout_hold_until && new Date(user.payout_hold_until) > new Date()) {
    return { ok: false, reason: "Funds still pending clearance" };
  }

  // Minimum payout
  if (amount < 5) {
    return { ok: false, reason: "Minimum withdrawal is $5" };
  }

  return { ok: true };
}
