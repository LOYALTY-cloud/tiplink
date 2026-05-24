/**
 * Security Monitor — Thresholds
 * All numeric detection limits in one place. Tune here; no code changes needed.
 */

export const THRESHOLDS = {
  // Rolling window for all rules (minutes)
  windowMinutes: 5,

  // De-dupe: don't reopen an alert for the same IP+type within this many minutes
  dedupWindowMinutes: 30,

  // Rate flood: how many distinct rate-limit actions from the same IP
  rateFlood: {
    mediumKeys: 5,
    highKeys: 10,
    criticalKeys: 15,
    criticalHits: 200,
  },

  // Auth spike: total failures across all IPs
  authSpike: {
    medium: 15,
    high: 30,
    critical: 50,
  },

  // Admin anomaly: actions per single actor
  adminAnomaly: {
    medium: 30,
    high: 60,
    critical: 100,
  },

  // Stripe anomaly: payouts in window
  stripeAnomaly: {
    largeSingleAmount: 500,   // USD — single payout this big = flag
    highVelocityCount: 10,    // this many payouts in window = flag
  },

  // Scraping: distinct routes from same IP via rate_limits keys
  ipSweep: {
    medium: 8,
    high: 15,
  },

  // Honeypot: any hit = HIGH immediately
  honeypotSeverity: "HIGH" as const,
} as const;
