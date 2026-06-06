import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { handleStripeEvent } from "@/app/api/stripe/webhook/route";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/reconcile-stripe?key=CRON_SECRET
 *
 * Pass 1: Re-process Stripe platform events from the last 7 days that were
 * missed by the webhook handler (network gaps, deployment downtime, etc.)
 *
 * Pass 2: Find tip_intents stuck in 'pending'/'created' status whose
 * PaymentIntent succeeded on Stripe but whose wallet credit was never
 * recorded. Idempotency-safe: skips intents that already have a
 * transactions_ledger row of type 'tip_received'.
 *
 * Safe to run multiple times — the webhook handler's own deduplication
 * (stripe_webhook_events + tip_intent.status check) prevents double-processing.
 */
export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = new URL(req.url).searchParams.get("key");
  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Pass 1: re-process missed platform Stripe events (7-day window) ──────
  const relevantTypes = [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "refund.created",
    "charge.refunded",
    "payout.paid",
    "payout.failed",
    "account.updated",
    "account.application.deauthorized",
    "charge.dispute.created",
    "checkout.session.completed",
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ];

  // Extended to 7 days — covers deployments that were down for up to a week
  const since = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  let reprocessed = 0;
  let alreadyProcessed = 0;
  let failed = 0;
  let totalFetched = 0;

  try {
    for await (const event of stripe.events.list({
      created: { gte: since },
      limit: 100,
    })) {
      if (!relevantTypes.includes(event.type)) continue;
      totalFetched++;

      const { data: existing } = await supabaseAdmin
        .from("stripe_webhook_events")
        .select("id")
        .eq("id", event.id)
        .maybeSingle();

      if (existing) {
        alreadyProcessed++;
        continue;
      }

      console.warn(`[reconcile-stripe] Missed event: ${event.type} ${event.id}`);
      try {
        await handleStripeEvent(event as any);
        reprocessed++;
      } catch (e) {
        console.error(`[reconcile-stripe] Failed to reprocess ${event.id}:`, e);
        failed++;
      }
    }
  } catch (e) {
    console.error("[reconcile-stripe] Stripe event list failed:", e);
    return NextResponse.json({ error: "Stripe API error" }, { status: 500 });
  }

  // ── Pass 2: reconcile stuck tip_intents ───────────────────────────────────
  // Find tips that were created on Stripe (have a PI id) but whose wallet
  // credit was never recorded — e.g. because the webhook was missed entirely
  // and the event fell outside the 7-day window above.
  let tipsFixed = 0;
  let tipsSkipped = 0;
  let tipsFailed = 0;

  try {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: stuckIntents } = await supabaseAdmin
      .from("tip_intents")
      .select("id, receipt_id, creator_user_id, tip_amount, stripe_payment_intent_id, platform_fee, stripe_fee")
      .in("status", ["pending", "created"])
      .lt("created_at", staleThreshold)
      .not("stripe_payment_intent_id", "is", null)
      .limit(200);

    for (const intent of stuckIntents ?? []) {
      try {
        // Retrieve the PI from the platform account (destination charges live here)
        const pi = await stripe.paymentIntents.retrieve(intent.stripe_payment_intent_id as string);

        if (pi.status !== "succeeded") {
          // PI not paid — mark as failed if it's been cancelled/expired
          if (["canceled", "requires_payment_method"].includes(pi.status)) {
            await supabaseAdmin
              .from("tip_intents")
              .update({ status: "failed" })
              .eq("id", intent.id);
          }
          tipsSkipped++;
          continue;
        }

        // Idempotency: check if ledger entry already exists for this intent
        const { data: existing } = await supabaseAdmin
          .from("transactions_ledger")
          .select("id")
          .eq("user_id", intent.creator_user_id)
          .eq("reference_id", intent.id)
          .eq("type", "tip_received")
          .maybeSingle();

        if (existing) {
          // Ledger entry exists — just fix the tip_intent status
          await supabaseAdmin
            .from("tip_intents")
            .update({ status: "succeeded" })
            .eq("id", intent.id);
          tipsSkipped++;
          continue;
        }

        // No ledger entry — credit the wallet under a wallet lock
        const lock = await acquireWalletLock(supabaseAdmin, intent.creator_user_id as string, "withdrawal", 30);
        if (!lock.ok) {
          console.warn(`[reconcile-stripe] Wallet locked for ${intent.creator_user_id}, skipping intent ${intent.id}`);
          tipsSkipped++;
          continue;
        }

        try {
          const receivedAmount = Number(intent.tip_amount);

          await addLedgerEntry({
            user_id: intent.creator_user_id as string,
            type: "tip_received",
            amount: receivedAmount,
            reference_id: intent.id as string,
            meta: {
              action: "tip",
              via: "reconcile_stuck_intent",
              fee: Number(intent.stripe_fee ?? 0) + Number(intent.platform_fee ?? 0),
              net: receivedAmount,
              stripe_payment_intent_id: pi.id,
              receipt_id: intent.receipt_id,
            },
            status: "completed",
          });

          await supabaseAdmin
            .from("tip_intents")
            .update({ status: "succeeded" })
            .eq("id", intent.id);

          tipsFixed++;
          console.log(`[reconcile-stripe] Fixed stuck tip_intent ${intent.id} — credited $${receivedAmount} to ${intent.creator_user_id}`);
        } finally {
          await releaseWalletLock(supabaseAdmin, intent.creator_user_id as string, "withdrawal").catch(() => {});
        }
      } catch (e) {
        console.error(`[reconcile-stripe] Error reconciling tip_intent ${intent.id}:`, e);
        tipsFailed++;
      }

      // Throttle to avoid Stripe rate limits
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (e) {
    console.error("[reconcile-stripe] Stuck tip_intents pass failed:", e);
  }

  console.log(
    `[reconcile-stripe] Pass1: total=${totalFetched} already=${alreadyProcessed} reprocessed=${reprocessed} failed=${failed} | Pass2: fixed=${tipsFixed} skipped=${tipsSkipped} failed=${tipsFailed}`
  );

  return NextResponse.json({
    ok: true,
    pass1: { total: totalFetched, alreadyProcessed, reprocessed, failed },
    pass2: { fixed: tipsFixed, skipped: tipsSkipped, failed: tipsFailed },
  });
}
