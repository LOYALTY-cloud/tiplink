import type { SupabaseClient } from "@supabase/supabase-js";

export type RiskResult = {
  user_id: string;
  restricted: boolean;
  rules_fired: Array<{ rule: string; value: number; threshold: number }>;
  evaluated_at: string;
};

/**
 * Evaluate automated risk rules for a user.
 * Calls the DB-level `evaluate_risk_rules` RPC which:
 *   - Checks refund velocity (>3 in 24h → restrict)
 *   - Checks active disputes (≥1 → restrict)
 *   - Checks owed_balance (>0 → restrict)
 *   - Checks withdrawal velocity (>$500/hr → restrict)
 * Auto-restricts active accounts if any rule fires.
 */
export async function evaluateRisk(
  supabaseClient: SupabaseClient,
  userId: string
): Promise<RiskResult> {
  const { data, error } = await supabaseClient.rpc("evaluate_risk_rules", {
    p_user_id: userId,
  });

  if (error) {
    console.error(`[RISK ENGINE] Failed to evaluate user ${userId}:`, error.message);
    return {
      user_id: userId,
      restricted: false,
      rules_fired: [],
      evaluated_at: new Date().toISOString(),
    };
  }

  const result = data as RiskResult;

  if (result.restricted && result.rules_fired.length > 0) {
    console.error(
      `[ALERT] [RISK ENGINE] Auto-restricted user ${userId}. Rules: ${result.rules_fired.map((r) => r.rule).join(", ")}`
    );
  }

  return result;
}
