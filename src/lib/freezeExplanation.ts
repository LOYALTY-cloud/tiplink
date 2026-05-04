/**
 * Freeze Explanation Engine
 *
 * Converts raw fraud signal keys into user-friendly explanations.
 * Used in: FreezeBanner UI, freeze emails, audit logs.
 */

/** Map of internal signal keys → human-readable explanation */
const SIGNAL_MAP: Record<string, string> = {
  new_device: "New device detected",
  new_ip: "Location change detected",
  rapid_withdrawals: "Unusual withdrawal pattern",
  withdrawal_spike: "Withdrawal amount higher than usual",
  instant_withdrawal: "Immediate withdrawal after receiving funds",
  ledger_drift: "Temporary system balance inconsistency",
  multi_account: "Multiple account activity detected",
  recent_chargeback: "Recent payment dispute detected",
  recent_dispute: "Recent payment dispute detected",
  activity_spike: "Unusual spike in account activity",
  low_trust: "Account trust score dropped below threshold",
  card_spam: "Multiple payment attempts detected",
  refund_abuse: "Unusual refund activity detected",
  ip_change: "Location change detected",
  rapid_fire: "Rapid-fire withdrawal pattern detected",
  tip_withdraw_loop: "Repeated tip-then-withdraw pattern detected",
};

/**
 * Convert raw signal keys to human-readable explanation strings.
 * Unknown signals are passed through with basic formatting.
 */
export function generateFreezeExplanation(signals: string[]): string[] {
  return signals
    .map((s) => SIGNAL_MAP[s] ?? formatUnknownSignal(s))
    .filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate
}

/**
 * Smart summary — a single contextual sentence based on the dominant signal.
 * Shown above the bullet list for a more human tone.
 */
export function summarizeFreeze(signals: string[]): string {
  if (signals.includes("multi_account")) {
    return "We detected activity that may be linked to multiple accounts.";
  }
  if (signals.includes("recent_chargeback") || signals.includes("recent_dispute")) {
    return "A recent payment dispute requires us to verify your account.";
  }
  if (signals.includes("rapid_withdrawals") || signals.includes("rapid_fire")) {
    return "We noticed unusual withdrawal activity that needs a quick check.";
  }
  if (signals.includes("tip_withdraw_loop") || signals.includes("instant_withdrawal")) {
    return "We detected a pattern that needs a quick verification.";
  }
  if (signals.includes("new_device") || signals.includes("new_ip") || signals.includes("ip_change")) {
    return "We noticed a sign-in from an unrecognized device or location.";
  }
  if (signals.includes("activity_spike")) {
    return "We detected an unusual spike in activity on your account.";
  }
  if (signals.includes("low_trust")) {
    return "Your account trust score dropped, so we paused withdrawals as a precaution.";
  }
  return "We detected unusual activity and need to verify your account.";
}

/**
 * Build the comma-separated reason string stored in `profiles.freeze_reason`.
 * Keeps it human-readable while also machine-parseable.
 */
export function buildFreezeReason(signals: string[]): string {
  const explanations = generateFreezeExplanation(signals);
  return explanations.join(", ");
}

/**
 * Extract signal keys from a FreezeContext-like object.
 * Call this at freeze time to collect what triggered the freeze.
 */
export function collectFreezeSignals(ctx: {
  recent_chargeback?: boolean;
  multi_account_flag?: boolean;
  rapid_withdrawals?: boolean;
  activity_spike?: boolean;
  trust_score?: number;
  new_device?: boolean;
  new_ip?: boolean;
  ledger_drift?: boolean;
  tip_withdraw_loop?: boolean;
}): string[] {
  const signals: string[] = [];
  if (ctx.recent_chargeback) signals.push("recent_chargeback");
  if (ctx.multi_account_flag) signals.push("multi_account");
  if (ctx.rapid_withdrawals) signals.push("rapid_withdrawals");
  if (ctx.activity_spike) signals.push("activity_spike");
  if (ctx.trust_score !== undefined && ctx.trust_score < 25) signals.push("low_trust");
  if (ctx.new_device) signals.push("new_device");
  if (ctx.new_ip) signals.push("new_ip");
  if (ctx.ledger_drift) signals.push("ledger_drift");
  if (ctx.tip_withdraw_loop) signals.push("tip_withdraw_loop");
  return signals;
}

/** Fallback: format an unknown signal key into readable text */
function formatUnknownSignal(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
