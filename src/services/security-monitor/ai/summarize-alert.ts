/**
 * AI: Summarize Alert — generate a plain-English human summary.
 * No PII. Uses guardInput + sanitizeContext before sending.
 * Falls back to the rule-generated summary on error.
 */

import OpenAI from "openai";
import { guardInput, sanitizeContext } from "@/lib/aiGuard";
import type { SecurityAlert } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("ai-summarize");

export async function summarizeAlert(alert: SecurityAlert): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return alert.summary;

  const safeEvidence = sanitizeContext(alert.evidence as Record<string, unknown>);
  const prompt = `You are a security analyst summarising an alert for a non-technical admin. 
Write 2-3 sentences that explain what happened, why it's concerning, and what the risk is.
Do not include IP addresses, user IDs, or any personal data in your response.

Alert type: ${alert.type}
Severity: ${alert.severity}
Rule summary: ${alert.summary}
Evidence: ${JSON.stringify(safeEvidence).slice(0, 500)}`;

  const check = guardInput(prompt);
  if (!check.safe) {
    log.warn("guardInput blocked summarize prompt");
    return alert.summary;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (text && text.length > 10) return text;
    return alert.summary;
  } catch (err) {
    log.error("AI summarize failed", { message: String(err) });
    return alert.summary;
  }
}
