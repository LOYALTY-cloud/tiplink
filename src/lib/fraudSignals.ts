/**
 * Fraud Signal Logger
 *
 * Centralized utility for recording fraud signals into the `fraud_signals`
 * table and creating `fraud_cases` for admin review.
 *
 * Usage:
 *   await logFraudSignal(userId, "ledger_drift", 30, { drift: 12.50 });
 *   await createFraudCase(userId, 25, "high", ["Ledger drift", "Rapid withdrawals"], "ledger_audit");
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function logFraudSignal(
  userId: string,
  type: string,
  weight: number = 0,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabaseAdmin.from("fraud_signals").insert({
      user_id: userId,
      type,
      weight,
      metadata,
    });
  } catch (e) {
    console.error("[logFraudSignal] Failed:", e);
  }
}

export async function createFraudCase(
  userId: string,
  riskScore: number,
  riskLevel: string,
  signals: string[],
  source: string = "withdrawal"
) {
  try {
    // Avoid duplicate open cases for the same user + source within 24h
    const { data: existing } = await supabaseAdmin
      .from("fraud_cases")
      .select("id")
      .eq("user_id", userId)
      .eq("source", source)
      .eq("status", "open")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (existing) {
      // Update existing case with latest score/signals
      await supabaseAdmin
        .from("fraud_cases")
        .update({
          risk_score: riskScore,
          risk_level: riskLevel,
          signals,
        })
        .eq("id", existing.id);
      return;
    }

    await supabaseAdmin.from("fraud_cases").insert({
      user_id: userId,
      risk_score: riskScore,
      risk_level: riskLevel,
      signals,
      source,
    });
  } catch (e) {
    console.error("[createFraudCase] Failed:", e);
  }
}
