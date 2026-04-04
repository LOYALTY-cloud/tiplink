/**
 * Dispatch page context data to the AI Assistant panel.
 * Automatically strips sensitive keys before dispatching.
 *
 * Usage:
 *   dispatchAIContext({ open_count: 5, sla_breaching: 2 })
 */

/** Keys that should never be sent to the AI panel */
const STRIP_KEYS = new Set([
  "email", "stripe_id", "stripe_customer_id", "stripe_account_id",
  "stripe_payment_intent_id", "payment_method_id", "api_key", "secret",
  "password", "token", "ip", "ip_address", "phone", "ssn", "dob",
  "bank_account", "card_number", "card_last4", "full_name",
  "first_name", "last_name", "address",
])

function stripSensitive(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (STRIP_KEYS.has(key.toLowerCase())) continue
    if (value && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = stripSensitive(value as Record<string, unknown>)
    } else {
      clean[key] = value
    }
  }
  return clean
}

export function dispatchAIContext(data: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("aiAssistContext", { detail: stripSensitive(data) }))
}
