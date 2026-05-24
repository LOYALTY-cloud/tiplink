/**
 * Core domain types for the Security Monitor.
 * These are the only types the rest of the app needs to import
 * (via the emitSecurityEvent bridge in src/lib/security-event.ts).
 */

// ── Event types emitted by the app ─────────────────────────

export type SecurityEventType =
  // Auth
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "PASSWORD_RESET"
  | "SESSION_CREATED"
  | "SESSION_REVOKED"
  | "TWO_FA_FAILURE"
  // Admin
  | "ADMIN_ACCESS"
  | "ADMIN_ACTION"
  | "ADMIN_LOGIN"
  // Payments / Payouts
  | "PAYOUT_CREATED"
  | "PAYOUT_LARGE"
  | "TIP_CREATED"
  // API / System
  | "RATE_LIMIT_HIT"
  | "SUSPICIOUS_REQUEST"
  | "STRIPE_WEBHOOK"
  | "ACCOUNT_FREEZE"
  | "HONEYPOT_HIT";

export interface SecurityEvent {
  type: SecurityEventType;
  ip?: string | null;
  userId?: string | null;   // opaque — never used to join user tables inside monitor
  route?: string | null;
  metadata?: Record<string, unknown>;  // only safe aggregates — no PII
  occurredAt?: string;
}

// ── Alert types produced by the rules engine ───────────────

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AlertType =
  | "AUTH_SPIKE"
  | "IP_SWEEP"
  | "SCRAPING"
  | "ADMIN_ANOMALY"
  | "STRIPE_ANOMALY"
  | "HONEYPOT_ACCESS"
  | "RATE_FLOOD"
  | "CREDENTIAL_STUFFING";

export interface SecurityAlert {
  id?: string;
  severity: AlertSeverity;
  type: AlertType;
  ip?: string | null;        // full IP — server-side only, never sent to client
  ipMasked?: string | null;  // first 3 octets — safe for display
  summary: string;           // human-readable, zero PII
  playbook?: string[];
  evidence: Record<string, unknown>;  // aggregates only
  status?: "OPEN" | "CONTAINED" | "RESOLVED" | "FALSE_POSITIVE";
  actionsTaken?: string[];
}

// ── Action result ───────────────────────────────────────────

export interface ActionResult {
  type: string;
  target: string;
  result: "OK" | "FAILED" | "SKIPPED";
  detail: string;
}
