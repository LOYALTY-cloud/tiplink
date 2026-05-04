import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logFraudSignal, createFraudCase } from "@/lib/fraudSignals";
import { shouldAutoFreeze, executeAutoFreeze } from "@/lib/autoFreeze";

export const runtime = "nodejs";

/**
 * GET /api/cron/ledger-audit?key=CRON_SECRET
 *
 * Periodic ledger invariant check. For every wallet, verifies:
 *   wallet.balance === SUM(transactions_ledger.amount)
 *
 * If a mismatch is found:
 *  - Logs an alert with the drift amount
 *  - Records the anomaly in `ledger_anomalies` table
 *  - Auto-corrects the wallet balance to match the ledger (source of truth)
 *
 * Run daily. Safe to run at any time.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all wallets with their stored balance
  const { data: wallets, error: walletsErr } = await supabaseAdmin
    .from("wallets")
    .select("user_id, balance")
    .limit(10000);

  if (walletsErr) {
    console.error("[ledger-audit] Failed to fetch wallets:", walletsErr);
    return NextResponse.json({ error: walletsErr.message }, { status: 500 });
  }

  let checked = 0;
  let mismatches = 0;
  let corrected = 0;
  let frozen = 0;
  const anomalies: Array<{
    user_id: string;
    wallet_balance: number;
    ledger_sum: number;
    drift: number;
  }> = [];

  for (const wallet of wallets ?? []) {
    checked++;

    // Sum all ledger entries for this user
    const { data: sumResult, error: sumErr } = await supabaseAdmin
      .rpc("sum_ledger_balance", { p_user_id: wallet.user_id });

    // Fallback: if RPC doesn't exist, query directly
    let ledgerSum: number;
    if (sumErr) {
      const { data: rows, error: queryErr } = await supabaseAdmin
        .from("transactions_ledger")
        .select("amount")
        .eq("user_id", wallet.user_id);

      if (queryErr) {
        console.error(`[ledger-audit] Failed to query ledger for ${wallet.user_id}:`, queryErr);
        continue;
      }

      ledgerSum = (rows ?? []).reduce((acc, r) => acc + Number(r.amount), 0);
    } else {
      ledgerSum = Number(sumResult ?? 0);
    }

    const walletBalance = Number(wallet.balance ?? 0);
    const drift = Number((walletBalance - ledgerSum).toFixed(2));

    if (Math.abs(drift) > 0.01) {
      mismatches++;

      const anomaly = {
        user_id: wallet.user_id,
        wallet_balance: walletBalance,
        ledger_sum: Number(ledgerSum.toFixed(2)),
        drift,
      };
      anomalies.push(anomaly);

      console.error(
        `[ALERT] ledger-audit: MISMATCH for user ${wallet.user_id}. wallet=$${walletBalance}, ledger=$${ledgerSum.toFixed(2)}, drift=$${drift}`
      );

      // Record anomaly for admin review
      try {
        await supabaseAdmin.from("ledger_anomalies").insert({
          user_id: wallet.user_id,
          wallet_balance: walletBalance,
          ledger_sum: Number(ledgerSum.toFixed(2)),
          drift,
          detected_at: new Date().toISOString(),
        });
      } catch (_) {
        // Table might not exist yet — non-blocking
      }

      // ── Feed fraud pipeline ──────────────────────────────

      // Signal weight scales with drift magnitude
      const signalWeight = Math.abs(drift) >= 50 ? 40 : Math.abs(drift) >= 10 ? 25 : 10;
      await logFraudSignal(wallet.user_id, "ledger_drift", signalWeight, {
        wallet_balance: walletBalance,
        ledger_sum: Number(ledgerSum.toFixed(2)),
        drift,
      });

      // Check how many anomalies this user has had recently (30 days)
      const { count: recentAnomalies } = await supabaseAdmin
        .from("ledger_anomalies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", wallet.user_id)
        .gte("detected_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const anomalyCount = (recentAnomalies ?? 0) + 1; // include the one we just inserted

      // Severe drift (>$50) or repeated anomalies → fraud case
      if (Math.abs(drift) >= 50 || anomalyCount >= 3) {
        const riskScore = Math.min(100, signalWeight + anomalyCount * 10);
        const riskLevel = riskScore >= 60 ? "high" : "medium";
        await createFraudCase(
          wallet.user_id,
          riskScore,
          riskLevel,
          [
            `Ledger drift: $${drift}`,
            `${anomalyCount} anomalies in 30d`,
            ...(Math.abs(drift) >= 50 ? ["Severe balance mismatch"] : []),
          ],
          "ledger_audit"
        );
      }

      // Critical drift (>$100) or 5+ anomalies → auto-freeze evaluation
      // Safety: require multi-signal confirmation — drift alone never freezes.
      // We check for recent withdrawal activity as a second signal.
      if (Math.abs(drift) >= 100 || anomalyCount >= 5) {
        const { count: recentWithdrawals } = await supabaseAdmin
          .from("withdrawals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", wallet.user_id)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

        // Only freeze if there's a confirming signal (recent withdrawal OR repeated anomalies)
        const hasConfirmingSignal = (recentWithdrawals ?? 0) > 0 || anomalyCount >= 5;

        if (hasConfirmingSignal) {
          const freezeResult = shouldAutoFreeze({
            userId: wallet.user_id,
            trust_score: 10, // force low score for severe ledger drift
            recent_chargeback: false,
            multi_account_flag: false,
            rapid_withdrawals: (recentWithdrawals ?? 0) >= 3,
            activity_spike: true,
            ledger_drift: true,
          });
          if (freezeResult) {
            await executeAutoFreeze(wallet.user_id, `ledger_audit: ${freezeResult.reason} (drift=$${drift}, anomalies=${anomalyCount})`, freezeResult.level, freezeResult.signals);
            frozen++;
          }
        } else {
          console.warn(`[ledger-audit] Drift=$${drift} for user ${wallet.user_id} but no confirming signal — skipping freeze`);
        }
      }

      // Auto-correct: recalculate wallet from ledger (source of truth)
      try {
        const { error: recalcErr } = await supabaseAdmin.rpc(
          "recalculate_wallet_balance",
          { p_user_id: wallet.user_id }
        );
        if (!recalcErr) {
          corrected++;
          console.log(`[ledger-audit] Auto-corrected wallet for user ${wallet.user_id}`);
        } else {
          console.error(`[ledger-audit] Recalculation failed for ${wallet.user_id}:`, recalcErr);
        }
      } catch (e) {
        console.error(`[ledger-audit] Recalculation error for ${wallet.user_id}:`, e);
      }
    }
  }

  console.log(
    `[ledger-audit] Done. checked=${checked} mismatches=${mismatches} corrected=${corrected} frozen=${frozen}`
  );

  return NextResponse.json({
    ok: true,
    checked,
    mismatches,
    corrected,
    frozen,
    anomalies,
  });
}
