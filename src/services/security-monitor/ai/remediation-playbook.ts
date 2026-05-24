/**
 * AI: Remediation Playbook — step-by-step containment instructions.
 * Returns an array of action steps. No PII.
 */

import OpenAI from "openai";
import { guardInput } from "@/lib/aiGuard";
import type { SecurityAlert } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("ai-playbook");

const FALLBACK_PLAYBOOKS: Record<string, string[]> = {
  AUTH_SPIKE:          ["Review rate_limits table for offending IPs", "Consider enabling CAPTCHA on login", "Alert security team"],
  CREDENTIAL_STUFFING: ["Block the source IP at the firewall", "Force-revoke active sessions for targeted accounts", "Notify affected users"],
  RATE_FLOOD:          ["Block or tighten rate limits for the source IP", "Review which endpoints were hit", "Enable bot-detection if not active"],
  IP_SWEEP:            ["Block the scanning IP at the firewall", "Review the routes that were probed for information disclosure"],
  HONEYPOT_ACCESS:     ["Block the IP immediately — honeypot access is unambiguous malicious intent", "Review access logs for prior activity from this IP"],
  ADMIN_ANOMALY:       ["Verify the admin user's identity out-of-band", "Review the audit log for anomalous actions", "Consider revoking the session pending investigation"],
  STRIPE_ANOMALY:      ["Review recent payouts in the Stripe dashboard", "Contact Stripe support if payouts appear fraudulent"],
  SCRAPING:            ["Block the scraping IP", "Review if sensitive data endpoints are properly rate-limited"],
};

export async function generatePlaybook(alert: SecurityAlert): Promise<string[]> {
  const fallback = FALLBACK_PLAYBOOKS[alert.type] ?? ["Investigate the alert and take appropriate action"];

  if (!process.env.OPENAI_API_KEY) return fallback;

  const prompt = `You are a security incident responder. Generate a numbered list of 3-5 concrete remediation steps for this alert.
Each step must be specific, actionable, and safe to execute. Do not suggest steps that could disrupt legitimate users.
Do not include IP addresses or user IDs.

Alert type: ${alert.type}
Severity: ${alert.severity}
Summary: ${alert.summary}

Reply with only the numbered list, no preamble.`;

  const check = guardInput(prompt);
  if (!check.safe) return fallback;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 350,
      temperature: 0.2,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const steps = text
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter((l) => l.length > 5);

    return steps.length >= 2 ? steps : fallback;
  } catch (err) {
    log.error("AI playbook failed", { message: String(err) });
    return fallback;
  }
}
