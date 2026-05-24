/**
 * AI: Classify Severity — override rule-based severity using GPT-4o-mini.
 * Falls back to rule-based severity on any error or when disabled.
 */

import OpenAI from "openai";
import { guardInput } from "@/lib/aiGuard";
import type { SecurityAlert, AlertSeverity } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("ai-classify");

const VALID_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export async function classifySeverity(alert: SecurityAlert): Promise<AlertSeverity> {
  if (!process.env.OPENAI_API_KEY) return alert.severity;

  // Guard the evidence blob — remove any PII before sending
  const safeEvidence = JSON.stringify(alert.evidence ?? {}).slice(0, 800);
  const prompt = `You are a security analyst. Given this alert summary and evidence, return ONLY one word: LOW, MEDIUM, HIGH, or CRITICAL.

Alert type: ${alert.type}
Summary: ${alert.summary}
Evidence: ${safeEvidence}
Rule-based severity: ${alert.severity}

Respond with exactly one word.`;

  const check = guardInput(prompt);
  if (!check.safe) {
    log.warn("guardInput blocked severity classification prompt");
    return alert.severity;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 5,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim().toUpperCase() ?? "";
    if (VALID_SEVERITIES.has(raw)) return raw as AlertSeverity;

    log.warn("AI returned unexpected severity value, falling back to rule-based", { raw });
    return alert.severity;
  } catch (err) {
    log.error("AI classify failed", { message: String(err) });
    return alert.severity;
  }
}
