import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { addLedgerEntry } from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * GET /api/cron/recover-stuck-payouts?key=CRON_SECRET
 *
 * Recovers withdrawals stuck in "pending" for over 1 hour by checking
 * their actual Stripe payout status. If the payout failed or was
 * canceled, marks the withdrawal as failed and reverses the ledger debit.
 *
 * Run hourly via Vercel cron.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: stuck, error } = await supabaseAdmin
    .from("withdrawals")
    .select("id, user_id, amount, stripe_payout_id, status")
    .eq("status", "pending")
    .lt("created_at", oneHourAgo)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let recovered = 0;
  let confirmed = 0;

  for (const w of stuck ?? []) {
    if (!w.stripe_payout_id || !w.user_id) continue;

    try {
      // Look up the profile to get the connected Stripe account
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_account_id")
        .eq("user_id", w.user_id)
        .maybeSingle();

      if (!profile?.stripe_account_id) continue;

      const payout = await stripe.payouts.retrieve(w.stripe_payout_id, {
        stripeAccount: profile.stripe_account_id,
      });

      if (payout.status === "paid") {
        // Webhook may have been missed — mark as paid
        await supabaseAdmin
          .from("withdrawals")
          .update({ status: "paid" })
          .eq("id", w.id);
        confirmed++;
      } else if (payout.status === "failed" || payout.status === "canceled") {
        // Mark withdrawal as failed and reverse ledger
        await supabaseAdmin
          .from("withdrawals")
          .update({ status: "failed", failure_reason: payout.failure_message ?? payout.status })
          .eq("id", w.id);

        await addLedgerEntry({
          user_id: w.user_id,
          type: "payout_reversal",
          amount: Number(w.amount),
          reference_id: w.stripe_payout_id,
          meta: {
            action: "stuck_payout_recovery",
            original_withdrawal_id: w.id,
            failure_message: payout.failure_message,
          },
          status: "completed",
        });

        recovered++;
      }
      // If still "pending" or "in_transit" on Stripe, leave it alone
    } catch (e) {
      console.error(`Failed to recover stuck payout ${w.id}:`, e);
    }
  }

  return NextResponse.json({ ok: true, stuck: stuck?.length ?? 0, recovered, confirmed });
}
