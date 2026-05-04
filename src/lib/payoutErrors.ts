/**
 * Human-readable payout failure messages.
 *
 * Maps Stripe's raw payout `failure_code` / `failure_message` strings
 * into clear, actionable text that creators can understand.
 *
 * Reference: https://docs.stripe.com/api/payouts/failures
 */

const FAILURE_MAP: Record<string, string> = {
  // Stripe failure_code values
  account_closed: "Your bank account has been closed. Please update your payout method.",
  account_frozen: "Your bank account is frozen. Contact your bank for details.",
  bank_account_restricted: "Your bank account has restrictions. Contact your bank to resolve this.",
  bank_ownership_changed: "Bank account ownership has changed. Please re-link your bank account.",
  could_not_process: "Your bank could not process this payout. Please try again or use a different payout method.",
  debit_not_authorized: "Your bank did not authorize this debit. Contact your bank for details.",
  declined: "Your bank declined the payout. Contact your bank for details.",
  incorrect_account_holder_name: "The name on your bank account doesn't match. Please update your payout details.",
  insufficient_funds: "There are insufficient funds to complete this payout. Please try again later.",
  invalid_account_number: "Your bank account number is invalid. Please update your payout method.",
  invalid_currency: "Your bank account does not support USD payouts. Please link a USD-compatible account.",
  no_account: "The bank account on file could not be found. Please re-link your bank account.",
  unsupported_card: "Your debit card does not support instant payouts. Please try a different card.",
};

/**
 * Convert a raw Stripe failure code/message into a user-friendly string.
 */
export function humanizePayoutFailure(
  failureCode: string | null | undefined,
  failureMessage: string | null | undefined
): string {
  // Try exact match on failure_code first
  if (failureCode && FAILURE_MAP[failureCode]) {
    return FAILURE_MAP[failureCode];
  }

  // Try partial match on failure_message
  if (failureMessage) {
    const lower = failureMessage.toLowerCase();
    for (const [key, friendly] of Object.entries(FAILURE_MAP)) {
      if (lower.includes(key.toLowerCase())) {
        return friendly;
      }
    }
  }

  // Fallback: clean up the raw message slightly
  if (failureMessage) {
    return `Your bank returned an error: ${failureMessage}. Please check your payout method or contact support.`;
  }

  return "Your payout could not be completed. Please check your payout method or contact support.";
}
