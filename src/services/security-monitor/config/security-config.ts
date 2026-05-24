/**
 * Security Monitor — Central Config
 * Reads from environment variables. All feature flags live here.
 */

export const securityConfig = {
  /** Master on/off switch. Set AI_SECURITY_MONITOR=false to disable everything. */
  get enabled(): boolean {
    return process.env.AI_SECURITY_MONITOR === "true";
  },

  /** "active" = detect + act automatically. "observe" = detect + alert only. */
  get mode(): "active" | "observe" {
    return process.env.SECURITY_MONITOR_MODE === "observe" ? "observe" : "active";
  },

  get openAiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  },

  vercel: {
    get token(): string | undefined { return process.env.VERCEL_API_TOKEN; },
    get teamId(): string | undefined { return process.env.VERCEL_TEAM_ID; },
    get projectId(): string | undefined { return process.env.VERCEL_PROJECT_ID; },
  },

  alerts: {
    get email(): string | undefined { return process.env.SECURITY_ALERT_EMAIL; },
    get discordWebhook(): string | undefined { return process.env.SECURITY_DISCORD_WEBHOOK; },
  },

  /** Stripe secret for reading balance / payout events */
  get stripeSecret(): string | undefined {
    return process.env.STRIPE_SECRET_KEY;
  },
} as const;
