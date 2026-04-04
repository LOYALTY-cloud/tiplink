/**
 * AI-powered fraud analysis using OpenAI.
 * Provides a secondary "smart" score on top of rule-based detection.
 * Fail-open: if AI is unavailable, returns neutral (score 0).
 */

import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export type AiFraudContext = {
  amount: number;
  recentTipCount: number;
  recentTotalVolume: number;
  uniqueCardsUsed: number;
  uniqueIps: number;
  accountAgeHours: number;
  currentRiskScore: number;
  previousRestrictions: number;
  isAnonymous: boolean;
  timeOfDay: number; // 0-23
};

export type AiFraudResult = {
  score: number;
  reason: string;
};

const SYSTEM_PROMPT = `You are a fintech fraud detection system. Analyze the transaction context and return a JSON object with:
- "score": integer 0-100 (0 = safe, 100 = definite fraud)
- "reason": one-sentence explanation

Scoring guidelines:
- 0-20: Normal behavior
- 21-40: Slightly unusual, monitor
- 41-60: Suspicious patterns, flag for review
- 61-80: High risk, likely fraudulent
- 81-100: Almost certainly fraud

Consider: transaction velocity, volume spikes, card diversity, IP patterns, account age, time of day, and previous risk history. Be conservative — false positives are costly.`;

export async function aiFraudCheck(
  context: AiFraudContext
): Promise<AiFraudResult> {
  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(context) },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0.1, // Low temperature for consistent scoring
    });

    const content = res.choices[0]?.message?.content;
    if (!content) return { score: 0, reason: "ai_no_response" };

    const parsed = JSON.parse(content) as { score?: number; reason?: string };
    return {
      score: Math.min(100, Math.max(0, Math.round(parsed.score ?? 0))),
      reason: String(parsed.reason ?? "unknown"),
    };
  } catch (err) {
    // Fail-open: AI unavailable → neutral score
    console.warn("[AI FRAUD] Analysis failed, returning neutral:", err instanceof Error ? err.message : err);
    return { score: 0, reason: "ai_unavailable" };
  }
}
