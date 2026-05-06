import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { handleStripeEvent } from "@/app/api/stripe/webhook/route";

export const runtime = "nodejs";

/**
 * GET /api/cron/reconcile-stripe?key=CRON_SECRET
 *
 * Daily reconciliation job that pulls Stripe events from the last 48 hours
 * and re-processes any that were missed by the webhook handler.
 *
 * Protects against:
 *  - Network failures during webhook delivery
 *  - Stripe delivery gaps
 *  - Deployment downtime
 *
 * Safe to run multiple times — the webhook handler's own idempotency
 * (stripe_webhook_events + processed_refunds) prevents double-processing.
 */
export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = new URL(req.url).searchParams.get("key");
  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    // Store subscription lifecycle — must be reconciled so missed webhooks
    // don't leave stores active after cancellation or renewal failures.
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ];

  const since = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);

  let reprocessed = 0;
  let alreadyProcessed = 0;
  let failed = 0;
  let totalFetched = 0;

  try {
    // Paginate through Stripe events from the last 48 hours
    for await (const event of stripe.events.list({
      created: { gte: since },
      limit: 100,
    })) {
      if (!relevantTypes.includes(event.type)) continue;
      totalFetched++;

      // Check if we already processed this event
      const { data: existing } = await supabaseAdmin
        .from("stripe_webhook_events")
        .select("id")
        .eq("id", event.id)
        .maybeSingle();

      if (existing) {
        alreadyProcessed++;
        continue;
      }

      // Missing event — re-process through the standard handler
      console.warn(`[reconcile-stripe] Missed event found: ${event.type} ${event.id}`);

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

  console.log(
    `[reconcile-stripe] Done. total=${totalFetched} already=${alreadyProcessed} reprocessed=${reprocessed} failed=${failed}`
  );

  return NextResponse.json({
    ok: true,
    total: totalFetched,
    alreadyProcessed,
    reprocessed,
    failed,
  });
}
