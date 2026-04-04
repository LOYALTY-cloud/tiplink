/**
 * AI Guard — security middleware between admin and OpenAI.
 *
 * Pipeline:  Admin → inputGuard → OpenAI → outputGuard → Admin
 *
 * Layers:
 *  1. Input sanitization  — block prompt injection & dangerous requests
 *  2. Context sanitization — strip PII / secrets before sending to AI
 *  3. Output filtering     — redact leaked secrets, PII, SQL, action claims
 *  4. Safe rewriting       — replace redacted content with safe fallback
 */

// ─── LAYER 1 — INPUT GUARD ──────────────────────────────────────────────────

const BLOCKED_INPUT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, label: "prompt_override" },
  { pattern: /ignore\s+(all\s+)?prior\s+instructions/i, label: "prompt_override" },
  { pattern: /ignore\s+(all\s+)?above\s+instructions/i, label: "prompt_override" },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|rules)/i, label: "prompt_override" },
  { pattern: /override\s+(your|the|all)\s+(rules|instructions|prompt)/i, label: "prompt_override" },
  { pattern: /show\s+(me\s+)?(the\s+)?(hidden|system|original)\s+(data|prompt|instructions)/i, label: "system_leak" },
  { pattern: /reveal\s+(the\s+)?(system\s+)?prompt/i, label: "system_leak" },
  { pattern: /dump\s+(the\s+)?(database|db|table|schema)/i, label: "data_dump" },
  { pattern: /SELECT\s+\*\s+FROM/i, label: "sql_injection" },
  { pattern: /DROP\s+TABLE/i, label: "sql_injection" },
  { pattern: /INSERT\s+INTO/i, label: "sql_injection" },
  { pattern: /DELETE\s+FROM/i, label: "sql_injection" },
  { pattern: /UPDATE\s+.*\s+SET\s+/i, label: "sql_injection" },
  { pattern: /what\s+is\s+(your|the)\s+(api|openai|stripe)\s+key/i, label: "key_extraction" },
  { pattern: /print\s+(env|environment|process\.env)/i, label: "env_leak" },
  { pattern: /show\s+(env|environment|variables|secrets)/i, label: "env_leak" },
  { pattern: /act\s+as\s+(a\s+)?different\s+(ai|assistant|system)/i, label: "role_hijack" },
  { pattern: /you\s+are\s+now\s+/i, label: "role_hijack" },
  { pattern: /pretend\s+(you\s+are|to\s+be)\s+/i, label: "role_hijack" },
  { pattern: /execute\s+(this\s+)?(command|code|script)/i, label: "code_exec" },
  { pattern: /run\s+(this\s+)?(command|code|query)/i, label: "code_exec" },
]

export type InputGuardResult =
  | { safe: true }
  | { safe: false; reason: string }

export function guardInput(message: string): InputGuardResult {
  const trimmed = message.trim()

  if (!trimmed || trimmed.length > 1000) {
    return { safe: false, reason: "Message is empty or too long." }
  }

  for (const { pattern, label } of BLOCKED_INPUT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: `blocked:${label}` }
    }
  }

  return { safe: true }
}

// ─── LAYER 2 — CONTEXT SANITIZER ────────────────────────────────────────────

/** Keys that must NEVER be sent to the AI */
const FORBIDDEN_CONTEXT_KEYS = new Set([
  "email",
  "stripe_id",
  "stripe_customer_id",
  "stripe_account_id",
  "stripe_payment_intent_id",
  "payment_method_id",
  "api_key",
  "secret",
  "password",
  "password_hash",
  "token",
  "refresh_token",
  "access_token",
  "session_token",
  "ip",
  "ip_address",
  "phone",
  "phone_number",
  "ssn",
  "date_of_birth",
  "dob",
  "bank_account",
  "card_number",
  "card_last4",
  "full_name",
  "first_name",
  "last_name",
  "address",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "zip",
  "postal_code",
])

/** Patterns in string values that indicate sensitive data */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /^sk_(live|test)_/,           // Stripe secret keys
  /^pk_(live|test)_/,           // Stripe public keys
  /^acct_[a-zA-Z0-9]+$/,       // Stripe account IDs
  /^pi_[a-zA-Z0-9]+$/,         // Stripe payment intents
  /^pm_[a-zA-Z0-9]+$/,         // Stripe payment methods
  /^cus_[a-zA-Z0-9]+$/,        // Stripe customer IDs
  /^[a-f0-9-]{36}$/,           // UUIDs (user IDs, etc.)
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,// Email addresses
  /^\+?\d{10,15}$/,            // Phone numbers
]

export function sanitizeContext(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase()

    // Drop forbidden keys entirely
    if (FORBIDDEN_CONTEXT_KEYS.has(lowerKey)) continue

    // Drop keys containing sensitive fragments
    if (lowerKey.includes("secret") || lowerKey.includes("token") || lowerKey.includes("password")) continue

    // Check string values for sensitive patterns
    if (typeof value === "string") {
      const isSensitive = SENSITIVE_VALUE_PATTERNS.some((p) => p.test(value))
      if (isSensitive) continue
    }

    // Recursively sanitize nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      clean[key] = sanitizeContext(value as Record<string, unknown>)
    } else {
      clean[key] = value
    }
  }

  return clean
}

// ─── LAYER 3 — OUTPUT GUARD ─────────────────────────────────────────────────

const SENSITIVE_OUTPUT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /sk_(live|test)_[a-zA-Z0-9]{10,}/g, label: "stripe_secret_key" },
  { pattern: /pk_(live|test)_[a-zA-Z0-9]{10,}/g, label: "stripe_public_key" },
  { pattern: /acct_[a-zA-Z0-9]{10,}/g, label: "stripe_account_id" },
  { pattern: /pi_[a-zA-Z0-9]{10,}/g, label: "stripe_payment_intent" },
  { pattern: /pm_[a-zA-Z0-9]{10,}/g, label: "stripe_payment_method" },
  { pattern: /cus_[a-zA-Z0-9]{10,}/g, label: "stripe_customer_id" },
  { pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, label: "uuid" },
  { pattern: /[^\s@]+@[^\s@]+\.[^\s@]+/g, label: "email" },
  { pattern: /SELECT\s+.+\s+FROM\s+/gi, label: "sql_query" },
  { pattern: /INSERT\s+INTO\s+/gi, label: "sql_query" },
  { pattern: /DROP\s+TABLE/gi, label: "sql_query" },
  { pattern: /process\.env\.[A-Z_]+/g, label: "env_variable" },
  { pattern: /OPENAI_API_KEY/gi, label: "api_key_name" },
  { pattern: /STRIPE_SECRET/gi, label: "api_key_name" },
]

/** Phrases that indicate the AI is claiming to take actions */
const ACTION_CLAIM_PATTERNS: RegExp[] = [
  /I\s+have\s+(now\s+)?(suspended|restricted|deleted|banned|removed|modified|updated|changed|created)/i,
  /I('ve|\s+have)\s+(now\s+)?(executed|performed|completed|processed)\s+(the\s+)?(action|operation|change)/i,
  /the\s+user\s+(has\s+been|is\s+now)\s+(suspended|restricted|deleted|banned|removed)/i,
  /I\s+(just\s+)?(took|made|applied)\s+(the\s+)?(action|change)/i,
  /successfully\s+(suspended|restricted|deleted|banned|removed|modified)/i,
]

export type OutputGuardResult =
  | { safe: true; text: string }
  | { safe: false; text: string; redactions: string[] }

export function guardOutput(text: string): OutputGuardResult {
  let cleaned = text
  const redactions: string[] = []

  // Redact sensitive patterns
  for (const { pattern, label } of SENSITIVE_OUTPUT_PATTERNS) {
    // Reset global regex state
    const regex = new RegExp(pattern.source, pattern.flags)
    if (regex.test(cleaned)) {
      redactions.push(label)
      cleaned = cleaned.replace(new RegExp(pattern.source, pattern.flags), "[redacted]")
    }
  }

  // Check for action claims and rewrite
  for (const pattern of ACTION_CLAIM_PATTERNS) {
    if (pattern.test(cleaned)) {
      redactions.push("action_claim")
      cleaned = "I can only provide guidance — I cannot take actions. Please use the admin panel to make changes."
      break
    }
  }

  // If too many redactions, replace the whole response
  if (redactions.length >= 3) {
    return {
      safe: false,
      text: "⚠️ Response blocked for security. The AI attempted to include sensitive information. Please rephrase your question.",
      redactions,
    }
  }

  if (redactions.length > 0) {
    return { safe: false, text: cleaned, redactions }
  }

  return { safe: true, text: cleaned }
}

// ─── USER-FACING BLOCKED MESSAGE ─────────────────────────────────────────────

export const BLOCKED_MESSAGE = "I'm not able to help with that, but I can guide you on safe alternatives. Try asking about best practices or how a feature works."

// ─── RISK SCORING — convert raw data to safe risk levels ─────────────────────

type RiskLevel = "low" | "medium" | "high" | "critical"

export function deriveRiskLevel(data: Record<string, unknown>): RiskLevel {
  const fraud = typeof data.fraud_score === "number" ? data.fraud_score : 0
  const disputes = typeof data.dispute_count === "number" ? data.dispute_count : 0
  const refundRate = typeof data.refund_rate === "number" ? data.refund_rate : 0

  if (fraud > 80 || disputes > 5) return "critical"
  if (fraud > 60 || disputes > 3 || refundRate > 0.3) return "high"
  if (fraud > 30 || disputes > 1 || refundRate > 0.15) return "medium"
  return "low"
}

/** Build a safe context summary from raw page data — no PII, just risk signals */
export function buildSafeContextSummary(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeContext(data)
  return {
    ...sanitized,
    risk_level: deriveRiskLevel(data),
  }
}
