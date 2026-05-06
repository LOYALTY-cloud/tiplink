import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { createNotification } from "@/lib/notifications";
import { humanizePayoutFailure } from "@/lib/payoutErrors";
import { reversePayoutOnce } from "@/lib/payoutReversals";
import { triggerAIAlerts } from "@/lib/ai/alerts";

export const runtime = "nodejs";

/**
 * GET /api/cron/release-payouts?key=CRON_SECRET
 *
 * Processes delayed withdrawals whose release_at has passed.
 * For each eligible withdrawal:
 *   1. Verifies the user still has sufficient Stripe balance
 *   2. Creates the Stripe payout
 *   3. Updates the withdrawal row with the payout ID
 *   4. On failure: marks withdrawal as "failed" and reverses the ledger debit
 *
 * Runs every 5 minutes. Safe to run concurrently — uses wallet locks.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Find all pending withdrawals whose hold has expired
  const { data: withdrawals, error: fetchErr } = await supabaseAdmin
    .from("withdrawals")
    .select("id, user_id, amount, fee, net, release_at, payout_destination")
    .eq("status", "pending")
    .not("release_at", "is", null)
    .lte("release_at", now)
    .order("release_at", { ascending: true })
    .limit(100); // batch size — prevents runaway if backlog builds up

  if (fetchErr) {
    console.error("[release-payouts] Failed to fetch pending withdrawals:", fetchErr);
    return NextResponse.json({ error: "Failed to fetch pending withdrawals." }, { status: 500 });
  }

  let released = 0;
  let failed = 0;
  let skipped = 0;

  for (const w of withdrawals ?? []) {
    // Acquire wallet lock to prevent concurrent mutation
    const lock = await acquireWalletLock(supabaseAdmin, w.user_id, "withdrawal", 120);
    if (!lock.ok) {
      skipped++;
      console.warn(`[release-payouts] Lock busy for user ${w.user_id}, withdrawal ${w.id} — will retry next run`);
      continue;
    }

    try {
      // Re-check: ensure withdrawal is still pending (another run might have gotten it)
      const { data: current } = await supabaseAdmin
        .from("withdrawals")
        .select("status")
        .eq("id", w.id)
        .maybeSingle();

      if (current?.status !== "pending") {
        skipped++;
        continue;
      }

      // Look up the user's connected Stripe account
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("stripe_account_id, is_frozen, account_status")
        .eq("user_id", w.user_id)
        .maybeSingle();

      if (!prof?.stripe_account_id) {
        console.error(`[release-payouts] No Stripe account for user ${w.user_id}`);
        await failWithdrawal(w.id, w.user_id, w.amount, "No connected Stripe account");
        failed++;
        continue;
      }

      // Safety: don't release payouts for frozen/restricted accounts
      if (prof.is_frozen || prof.account_status === "restricted" || prof.account_status === "suspended") {
        console.warn(`[release-payouts] Skipping frozen/restricted user ${w.user_id}`);
        skipped++;
        continue;
      }

      // Verify connected Stripe balance can cover the payout
      const amount = Number(w.amount);
      const reqCents = Math.round(amount * 100);

      try {
        const bal = await stripe.balance.retrieve({ stripeAccount: prof.stripe_account_id });
        const availableUsdCents = (bal.available || [])
          .filter((b) => b.currency === "usd")
          .reduce((sum, b) => sum + (b.amount || 0), 0);

        if (reqCents > availableUsdCents) {
          console.warn(`[release-payouts] Insufficient Stripe balance for ${w.user_id}: need ${reqCents}, have ${availableUsdCents}`);
          await failWithdrawal(w.id, w.user_id, amount, "Insufficient connected Stripe balance at release time");
          failed++;
          continue;
        }
      } catch (balErr) {
        console.error(`[release-payouts] Balance check failed for ${w.user_id}:`, balErr);
        skipped++; // retry next run
        continue;
      }

      // Create the Stripe payout
      const payout = await stripe.payouts.create(
        {
          amount: reqCents,
          currency: "usd",
          method: "instant",
          statement_descriptor: "1NELINK PAYOUT",
          metadata: { withdrawal_id: w.id, user_id: w.user_id },
          ...(w.payout_destination ? { destination: w.payout_destination } : {}),
        },
        { stripeAccount: prof.stripe_account_id }
      );

      // Update withdrawal row with payout details
      await supabaseAdmin
        .from("withdrawals")
        .update({
          stripe_payout_id: payout.id,
          payout_method: "instant",
          status: payout.status, // Stripe will fire payout.paid webhook → notification sent there
        })
        .eq("id", w.id);

      released++;
      console.log(`[release-payouts] Released withdrawal ${w.id} for user ${w.user_id}: payout ${payout.id}`);
    } catch (err) {
      console.error(`[release-payouts] Payout failed for withdrawal ${w.id}:`, err);
      const msg = err instanceof Error ? err.message : String(err ?? "Payout failed");
      await failWithdrawal(w.id, w.user_id, Number(w.amount), msg);
      failed++;
    } finally {
      try { await releaseWalletLock(supabaseAdmin, w.user_id, "withdrawal"); } catch (_) {}
    }
  }

  console.log(`[release-payouts] Done. released=${released} failed=${failed} skipped=${skipped}`);

  return NextResponse.json({
    ok: true,
    released,
    failed,
    skipped,
    total: (withdrawals ?? []).length,
  });
}

/**
 * Mark a withdrawal as failed, reverse the ledger debit, and notify the user.
 */
async function failWithdrawal(
  withdrawalId: string,
  userId: string,
  amount: number,
  reason: string
) {
  // Mark withdrawal as failed
  await supabaseAdmin
    .from("withdrawals")
    .update({ status: "failed", failure_reason: reason })
    .eq("id", withdrawalId);

  void triggerAIAlerts("cron.release-payouts:withdrawal_failed");

  // Reverse the ledger debit so funds return to wallet
  try {
    await reversePayoutOnce({
      supabase: supabaseAdmin,
      userId,
      amount,
      withdrawalId,
      reason,
      action: "delayed_payout_failed",
    });
  } catch (e) {
    console.error(`[release-payouts] CRITICAL: ledger reversal failed for withdrawal ${withdrawalId}:`, e);
  }

  // Notify the user
  try {
    const friendlyMessage = humanizePayoutFailure(null, reason);
    await createNotification({
      userId,
      type: "payout_failed",
      title: "⚠️ Payout Failed",
      body: `Your withdrawal of $${amount.toFixed(2)} could not be completed. ${friendlyMessage} The funds have been returned to your balance.`,
      meta: { failure_message: reason },
    });
  } catch (_) {}
}
