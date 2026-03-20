export const REFUND_REASONS = [
  "user_request",
  "fraud",
  "duplicate",
  "chargeback_prevention",
  "admin_error",
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  user_request: "User Request",
  fraud: "Fraud",
  duplicate: "Duplicate Charge",
  chargeback_prevention: "Chargeback Prevention",
  admin_error: "Admin Error",
};
