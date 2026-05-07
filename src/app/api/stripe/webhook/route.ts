import { NextRequest, NextResponse } from "next/server";
// Stripe client is only needed for signature verification in the POST handler.
// Avoid importing it at module load so tests can import `handleStripeEvent`
// without requiring STRIPE_SECRET_KEY to be set.
// ledger helper will be lazy-imported when needed so tests can inject a mock
import type Stripe from "stripe";
import type { StripeWebhookEvent } from "@/types/stripe";
import type { WalletRow } from "@/types/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logCaughtError } from "@/lib/errorLogger";
import { sendAdminAlert } from "@/lib/adminAlerts";
import { reversePayoutOnce } from "@/lib/payoutReversals";
import { triggerAIAlerts } from "@/lib/ai/alerts";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

async function isDuplicate(supabaseClient: SupabaseClient, eventId: string) {
  try {
    const { data } = await supabaseClient.from("stripe_webhook_events").select("id").eq("id", eventId).maybeSingle();
    return !!data;
  } catch (e) {
    console.error("isDuplicate check failed:", e);
    return true; // Fail CLOSED — skip event on DB error; Stripe will retry
  }
}

/**
 * Atomically mark event as processed. Uses upsert with onConflict so
 * concurrent deliveries don't both pass the isDuplicate check.
 * Throws on failure so the caller knows the event was NOT recorded.
 */
async function markProcessed(supabaseClient: SupabaseClient, eventId: string, type: string) {
  const { error } = await supabaseClient
    .from("stripe_webhook_events")
    .upsert(
      { id: eventId, type, processed_at: new Date().toISOString() },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (error) {
    console.error("markProcessed failed:", error);
    throw new Error(`markProcessed failed for ${eventId}: ${error.message}`);
  }
}

export async function POST(req: NextRequest) {
  const { stripe } = await import("@/lib/stripe/server");

  // Read secret lazily so module-level init never captures an empty string
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!endpointSecret) {
    console.error("CRITICAL: STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const buf = await req.arrayBuffer();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }
  let event: StripeWebhookEvent;

  try {
    event = stripe.webhooks.constructEvent(Buffer.from(buf), sig, endpointSecret) as unknown as StripeWebhookEvent;
  } catch (err: unknown) {
    console.error("⚠️ Webhook signature verification failed:", err instanceof Error ? err.message : err);
    logCaughtError("stripe/webhook", err, { severity: "critical", metadata: { reason: "signature_verification_failed" } });
    sendAdminAlert({
      subject: "Stripe webhook signature failed",
      body: "A Stripe webhook event could not be verified. This may indicate a misconfigured secret or a spoofed request.",
      severity: "critical",
      meta: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Delegate to handler so tests can call it directly.
  try {
    await handleStripeEvent(event as StripeWebhookEvent);
  } catch (err: unknown) {
    console.error("Webhook processing failed:", err);
    logCaughtError("stripe/webhook", err, { severity: "critical", metadata: { reason: "processing_failed" } });
    sendAdminAlert({
      subject: "Stripe webhook processing failed",
      body: `Webhook event ${event.type} (${event.id}) failed to process. Event was acknowledged to prevent retries.`,
      severity: "critical",
      meta: { event_type: event.type, event_id: event.id, error: err instanceof Error ? err.message : String(err) },
    });
    // Always return 200 to prevent Stripe retry storms on permanent failures.
    // Transient failures (e.g. lock contention) skip markProcessed so the
    // event can be re-processed on manual retry or reconciliation.
    return NextResponse.json({ received: true, error: "Processing failed" });
  }

  return NextResponse.json({ received: true });
}

// Exported for testing: processes a Stripe event object, performs deduplication,
// handles event types, and records the event as processed.
export async function handleStripeEvent(
  event: StripeWebhookEvent,
  supabaseClient?: SupabaseClient,
  ledgerFn?: any
) {
  if (!ledgerFn) {
    const mod = await import("@/lib/ledger");
    ledgerFn = mod.addLedgerEntry;
  }
  if (!supabaseClient) {
    const mod = await import("@/lib/supabase/admin");
    supabaseClient = mod.supabaseAdmin as SupabaseClient;
  }
  // wallet lock helpers (acquire/release) — lazy import so tests can inject mocks
  const lockMod = await import("@/lib/walletLocks");
  const { acquireWalletLock, releaseWalletLock } = lockMod;
  if (await isDuplicate(supabaseClient, event.id)) {
    console.log("Duplicate event skipped:", event.id);
    return;
  }

  switch (event.type) {
    // TIP PAYMENTS
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;

      // Prefer receipt_id metadata to find our pre-created tip_intents row
      const receiptId = (pi.metadata?.receipt_id as string) || null;

      if (!receiptId) {
        console.warn("payment_intent.succeeded missing receipt_id metadata", { intent: pi.id });
        break;
      }

      const { data: tipIntent, error: tipErr } = await supabaseClient
        .from("tip_intents")
        .select("*")
        .eq("receipt_id", receiptId)
        .maybeSingle();

      if (tipErr) {
        console.error("Failed to lookup tip_intents for receipt", receiptId, tipErr);
        break;
      }

      if (!tipIntent) {
        console.warn("No tip_intents row found for receipt", receiptId);
        break;
      }

      // Prevent duplicate processing (Stripe may retry webhooks)
      if (tipIntent.status === "succeeded") {
        console.log("Webhook already processed for tip_intent", tipIntent.id);
        break;
      }

      // Allow failed → succeeded transition (customer retried after a decline).
      // Any status other than succeeded/pending/created/failed is a terminal admin state — skip.
      const processableStatuses = ["pending", "created", "failed"];
      if (!processableStatuses.includes(tipIntent.status)) {
        console.warn(`Skipping payment_intent.succeeded for tip_intent in terminal status: ${tipIntent.status}`);
        break;
      }

      // Block tip credits to non-active accounts (closed, suspended, etc.)
      const { data: creatorProfile } = await supabaseClient
        .from("profiles")
        .select("account_status")
        .eq("user_id", tipIntent.creator_user_id)
        .maybeSingle();

      if (creatorProfile?.account_status && creatorProfile.account_status !== "active") {
        console.warn(
          `Blocked tip credit to ${creatorProfile.account_status} account: ${tipIntent.creator_user_id}. Auto-refunding PaymentIntent ${pi.id}.`
        );
        await supabaseClient
          .from("tip_intents")
          .update({
            status: "blocked_account",
            needs_refund: true,
            failure_reason: "account_not_active",
          })
          .eq("id", tipIntent.id);

        // Auto-refund the supporter — creator account is not active
        try {
          const { stripe: stripeClient } = await import("@/lib/stripe/server");
          await stripeClient.refunds.create({
            payment_intent: pi.id,
            reason: "fraudulent",
            metadata: {
              auto_refund: "true",
              reason: "creator_account_not_active",
              receipt_id: receiptId,
            },
          });
          await supabaseClient
            .from("tip_intents")
            .update({ refund_status: "full", needs_refund: false })
            .eq("id", tipIntent.id);
          console.log(`Auto-refunded blocked tip ${receiptId} for PaymentIntent ${pi.id}`);
        } catch (refundErr) {
          console.error(`Auto-refund failed for ${pi.id}:`, refundErr);
          // needs_refund stays true for manual admin intervention
        }
        break;
      }

      // Acquire wallet lock (use same lock type as withdrawals so they serialize)
      const lock = await acquireWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal", 300);
      if (!lock.ok) {
        throw new Error(`Wallet lock failed for tip_intent ${tipIntent.id}: ${lock.reason}`);
      }

      try {
        // Record canonical ledger entry FIRST (source of truth)
        const receivedAmount = Number(tipIntent.tip_amount ?? (tipIntent.amount as any));
        await ledgerFn({
          user_id: tipIntent.creator_user_id,
          type: "tip_received",
          amount: receivedAmount,
          reference_id: tipIntent.id,
          meta: {
            action: "tip",
            fee: Number(tipIntent.stripe_fee ?? 0) + Number(tipIntent.platform_fee ?? 0),
            net: receivedAmount,
            stripe_fee: Number(tipIntent.stripe_fee ?? 0),
            platform_fee: Number(tipIntent.platform_fee ?? 0),
            currency: pi.currency,
            receipt_id: receiptId,
            event_id: event.id,
            external_id: pi.id,
            supporter_name: tipIntent.is_anonymous ? null : (tipIntent.supporter_name || null),
            message: tipIntent.message || null,
            is_anonymous: tipIntent.is_anonymous ?? true,
          },
        });

        // Mark intent succeeded AFTER ledger write succeeds
        await supabaseClient
          .from("tip_intents")
          .update({ status: "succeeded", stripe_payment_intent_id: pi.id })
          .eq("id", tipIntent.id);

        // Auto-offset owed_balance if creator had a negative obligation
        const { data: creatorProf } = await supabaseClient
          .from("profiles")
          .select("owed_balance")
          .eq("user_id", tipIntent.creator_user_id)
          .maybeSingle();
        const owed = Number(creatorProf?.owed_balance ?? 0);
        if (owed > 0) {
          const newOwed = Math.max(0, Number((owed - receivedAmount).toFixed(2)));
          await supabaseClient
            .from("profiles")
            .update({ owed_balance: newOwed })
            .eq("user_id", tipIntent.creator_user_id);
          console.log(`Auto-offset owed_balance for user ${tipIntent.creator_user_id}: was $${owed}, now $${newOwed}`);
        }

        console.log(`Tip succeeded: $${receivedAmount} for user ${tipIntent.creator_user_id}`);

        // Fire notification (best-effort, don't block webhook)
        try {
          const { createNotification } = await import("@/lib/notifications");
          await createNotification({
            userId: tipIntent.creator_user_id,
            type: "tip",
            title: "💸 You got paid!",
            body: `You received $${receivedAmount.toFixed(2)}`,
            meta: { amount: receivedAmount, fee: 0, net: receivedAmount },
          });
        } catch (_) {}

        // Send receipt email to supporter if they provided an email
        if (tipIntent.supporter_email) {
          try {
            const { sendTipReceipt } = await import("@/lib/email/sendTipReceipt");
            const { data: creatorData } = await supabaseClient
              .from("profiles")
              .select("display_name, handle")
              .eq("user_id", tipIntent.creator_user_id)
              .maybeSingle();
            const creatorLabel = creatorData?.display_name || creatorData?.handle || "Creator";
            sendTipReceipt({
              to: tipIntent.supporter_email,
              receiptId: receiptId,
              amountUsd: `$${receivedAmount.toFixed(2)}`,
              creatorName: creatorLabel,
              createdAt: new Date().toLocaleString("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit", timeZoneName: "short",
              }),
            }).catch(() => {});
          } catch (_) {}
        }
      } catch (e) {
        console.error("Failed to record ledger entry for tip_intent", tipIntent.id, e);
        throw e;
      } finally {
        try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (e) {}
      }

      // Risk engine: evaluate after tip (catches owed_balance auto-offset edge cases)
      try {
        const { evaluateRisk } = await import("@/lib/riskEngine");
        await evaluateRisk(supabaseClient, tipIntent.creator_user_id);
      } catch (_e) {}

      // Set graduated payout hold on new funds (decreases as trust grows)
      try {
        const { data: creatorProfile } = await supabaseClient
          .from("profiles")
          .select("successful_payouts")
          .eq("user_id", tipIntent.creator_user_id)
          .maybeSingle();

        const payouts = creatorProfile?.successful_payouts ?? 0;
        let holdHours: number;
        if (payouts >= 20) holdHours = 0;       // instant eligibility
        else if (payouts >= 6) holdHours = 2;   // 2h hold
        else if (payouts >= 3) holdHours = 12;  // 12h hold
        else holdHours = 24;                    // 24h hold for new users

        if (holdHours > 0) {
          const newHold = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();
          // Atomic GREATEST — only extend, never shorten an existing hold
          await supabaseClient.rpc("set_payout_hold_if_later", {
            p_user_id: tipIntent.creator_user_id,
            p_hold_until: newHold,
          });
        }
      } catch (_) {}

      // Refresh user baseline — throttled to avoid expensive recalculation on every tip.
      // Only refreshes if 5+ new transactions since the last baseline update.
      try {
        const { data: bl } = await supabaseClient
          .from("user_baselines")
          .select("total_tips_count, updated_at")
          .eq("user_id", tipIntent.creator_user_id)
          .maybeSingle();

        const lastUpdate = bl?.updated_at ? new Date(bl.updated_at).getTime() : 0;
        const minInterval = 15 * 60 * 1000; // 15 minutes minimum
        const stale = Date.now() - lastUpdate > minInterval;

        if (!bl || stale) {
          // Count tips since last baseline refresh
          const { count: newTips } = await supabaseClient
            .from("transactions_ledger")
            .select("id", { count: "exact", head: true })
            .eq("user_id", tipIntent.creator_user_id)
            .eq("type", "tip")
            .gt("created_at", bl?.updated_at ?? "1970-01-01T00:00:00Z");

          if (!bl || (newTips ?? 0) >= 5) {
            await supabaseClient.rpc("refresh_user_baseline", { p_user_id: tipIntent.creator_user_id });
          }
        }
      } catch (_) {}

      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const receiptId = (pi.metadata?.receipt_id as string) || null;
      const failureMessage = pi.last_payment_error?.message || "Payment failed";

      console.warn(`Payment failed for PI ${pi.id}: ${failureMessage}`);

      if (receiptId) {
        // Update tip_intents status + failure reason.
        // Never overwrite a succeeded tip — Stripe can fire payment_failed for earlier
        // declined attempts on a PI that eventually succeeded on retry.
        await supabaseClient
          .from("tip_intents")
          .update({
            status: "failed",
            failure_reason: failureMessage.slice(0, 500),
          })
          .eq("receipt_id", receiptId)
          .in("status", ["pending", "created"]);
      } else {
        // Fallback: try by stripe_payment_intent_id
        await supabaseClient
          .from("tip_intents")
          .update({
            status: "failed",
            failure_reason: failureMessage.slice(0, 500),
          })
          .eq("stripe_payment_intent_id", pi.id)
          .in("status", ["pending", "created"]);
      }

      break;
    }

    // REFUNDS — primary handler via refund.created (one event per slice, cleanest for partials)
    case "refund.created": {
      const refund = event.data.object as Stripe.Refund;
      const refundId = refund.id;
      // Prefer refund.payment_intent — avoid charge mapping fallbacks
      const paymentIntentId = typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : (refund.payment_intent as Stripe.PaymentIntent)?.id ?? null;
      const sliceAmount = (refund.amount ?? 0) / 100;

      if (!paymentIntentId) {
        console.warn("refund.created missing payment_intent", refundId);
        break;
      }

      const { data: tipIntent, error: tipErr } = await supabaseClient
        .from("tip_intents")
        .select("*")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (tipErr) { console.error("refund.created: tip lookup failed", tipErr); break; }
      if (!tipIntent) { console.warn("refund.created: no tip for PI", paymentIntentId); break; }

      // Hard idempotency: check processed_refunds table (unique constraint)
      const { data: alreadyProcessed } = await supabaseClient
        .from("processed_refunds")
        .select("refund_id")
        .eq("refund_id", refundId)
        .maybeSingle();
      if (alreadyProcessed) {
        console.log("refund.created: already processed (unique table)", refundId);
        break;
      }

      // Soft idempotency: also check array (fast path, no extra query in most cases)
      if ((tipIntent.processed_refund_ids ?? []).includes(refundId)) {
        console.log("refund.created: already processed refund slice", refundId);
        break;
      }

      // Already fully refunded — nothing left to debit (also handles out-of-order webhooks)
      if (tipIntent.refund_status === "full" || (Number(tipIntent.refunded_amount ?? 0) >= Number(tipIntent.tip_amount ?? (tipIntent.amount as any)))) {
        console.log("refund.created: tip already fully refunded", tipIntent.id);
        break;
      }

      const lock = await acquireWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal", 300);
      if (!lock.ok) {
        throw new Error(`Wallet lock failed for refund.created on tip ${tipIntent.id}: ${lock.reason}`);
      }

      try {
        // Re-check idempotency after acquiring lock to close the race window
        const { data: alreadyProcessedPostLock } = await supabaseClient
          .from("processed_refunds")
          .select("refund_id")
          .eq("refund_id", refundId)
          .maybeSingle();
        if (alreadyProcessedPostLock) {
          console.log("refund.created: already processed (post-lock check)", refundId);
          break;
        }

        const tipAmount = Number(tipIntent.tip_amount ?? (tipIntent.amount as any));
        const previouslyRefunded = Number(tipIntent.refunded_amount ?? 0);
        const newRefundedTotal = Number((previouslyRefunded + sliceAmount).toFixed(2));
        const isFull = newRefundedTotal >= tipAmount;
        const newRefundStatus = isFull ? "full" : "partial";

        // Check current balance — if negative would result, flag account + track owed_balance
        const { data: walletRow } = await supabaseClient
          .from("wallets")
          .select("balance")
          .eq("user_id", tipIntent.creator_user_id)
          .maybeSingle();
        const currentBalance = Number(walletRow?.balance ?? 0);
        if (currentBalance < sliceAmount) {
          const owedAmount = Number((sliceAmount - currentBalance).toFixed(2));
          console.error(
            `[ALERT] refund.created: balance $${currentBalance} < refund $${sliceAmount} for user ${tipIntent.creator_user_id}. Account going negative by $${owedAmount}.`
          );
          await supabaseClient
            .from("profiles")
            .update({
              account_status: "restricted",
              status_reason: "balance_below_refund_obligation",
              owed_balance: owedAmount,
            })
            .eq("user_id", tipIntent.creator_user_id);
        }

        // Alert on multiple refunds for the same tip
        if (previouslyRefunded > 0) {
          console.warn(
            `[ALERT] refund.created: multiple refund slices on tip ${tipIntent.id}. Previous: $${previouslyRefunded}, new slice: $${sliceAmount}, total: $${newRefundedTotal}`
          );
        }

        // Build normalized meta for audit
        const refundMeta = {
          action: "refund",
          tip_intent_id: tipIntent.id,
          refund_id: refundId,
          payment_intent_id: paymentIntentId,
          amount: sliceAmount,
          currency: refund.currency,
          reason: refund.reason || "unspecified",
          slice_amount: sliceAmount,
          refund_type: newRefundStatus,
          total_refunded: newRefundedTotal,
          fee: 0,
          net: -sliceAmount,
          event_id: event.id,
        };

        // Atomic: ledger insert + tip_intent update + processed_refunds insert in one DB transaction
        const { error: rpcError } = await supabaseClient.rpc("apply_refund_slice", {
          p_tip_id: tipIntent.id,
          p_user_id: tipIntent.creator_user_id,
          p_amount: sliceAmount,
          p_refund_id: refundId,
          p_meta: refundMeta,
        });

        if (rpcError) {
          // If unique constraint violation on processed_refunds → idempotent skip
          if (rpcError.message?.includes("processed_refunds_pkey") || rpcError.code === "23505") {
            console.log("refund.created: duplicate caught by unique constraint", refundId);
            break;
          }
          throw new Error(`apply_refund_slice RPC failed: ${rpcError.message}`);
        }

        console.log(`Tip ${newRefundStatus} refund: $${sliceAmount} for user ${tipIntent.creator_user_id}`);

        // (E) Reconciliation: verify DB refunded_amount matches Stripe cumulative refunds
        try {
          const { stripe: stripeClient } = await import("@/lib/stripe/server");
          const reconPI = await stripeClient.paymentIntents.retrieve(paymentIntentId);
          const reconPIAny = reconPI as any;
          const stripeRefundedCents = reconPI.amount_received - (reconPIAny.charges?.data?.[0]?.amount_refunded
            ? reconPI.amount_received - reconPIAny.charges.data[0].amount_refunded
            : reconPI.amount_received);
          // Stripe amount_refunded on charge is the true cumulative
          const stripeCumulativeRefunded = (reconPIAny.charges?.data?.[0]?.amount_refunded ?? 0) / 100;
          const dbCumulativeRefunded = newRefundedTotal;
          const drift = Math.abs(stripeCumulativeRefunded - dbCumulativeRefunded);
          if (drift > 0.01) {
            console.error(
              `[ALERT] refund.created: DB/Stripe drift detected for tip ${tipIntent.id}. DB=$${dbCumulativeRefunded}, Stripe=$${stripeCumulativeRefunded}, drift=$${drift.toFixed(2)}`
            );
            // Auto-correct DB to Stripe truth
            await supabaseClient
              .from("tip_intents")
              .update({
                refunded_amount: stripeCumulativeRefunded,
                refund_status: stripeCumulativeRefunded >= tipAmount ? "full" : "partial",
              })
              .eq("id", tipIntent.id);
          }
        } catch (reconErr) {
          console.warn("refund.created: reconciliation check failed (non-blocking):", reconErr);
        }
      } catch (e) {
        console.error(`[ALERT] refund.created: failed to process slice for tip ${tipIntent.id}:`, e);
      } finally {
        try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (_e) {}
      }

      // Risk engine: evaluate after refund (catches refund velocity + owed_balance)
      try {
        const { evaluateRisk } = await import("@/lib/riskEngine");
        await evaluateRisk(supabaseClient, tipIntent.creator_user_id);
      } catch (_e) {}

      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const receiptId = (charge.metadata?.receipt_id as string) || null;
      // Use only the latest refund amount (partial support)
      const latestRefund = (charge.refunds?.data?.[0]?.amount ?? charge.amount_refunded ?? 0);
      const refundId = charge.refunds?.data?.[0]?.id ?? null;
      const refundAmount = latestRefund / 100;

      // Skip if this refund was already processed by refund.created (prevents double-debit)
      if (refundId) {
        const { data: alreadyProcessed } = await supabaseClient
          .from("processed_refunds")
          .select("refund_id")
          .eq("refund_id", refundId)
          .maybeSingle();
        if (alreadyProcessed) {
          console.log("charge.refunded: already processed by refund.created, skipping", refundId);
          break;
        }
      }

      if (receiptId) {
        const { data: tipIntent, error: tipErr } = await supabaseClient
          .from("tip_intents")
          .select("*")
          .eq("receipt_id", receiptId)
          .maybeSingle();

        if (tipErr) {
          console.error("Failed to lookup tip_intents for refund receipt", receiptId, tipErr);
          break;
        }

        if (!tipIntent) {
          console.warn("No tip_intents row found for refund receipt", receiptId);
          break;
        }

        // Guard: already fully refunded — skip
        if (tipIntent.refund_status === "full") {
          console.log("Tip already fully refunded, skipping:", tipIntent.id);
          break;
        }

        // Per-refund-id idempotency (fallback path)
        if (refundId && (tipIntent.processed_refund_ids ?? []).includes(refundId)) {
          console.log("charge.refunded: slice already processed", refundId);
          break;
        }

        // Acquire wallet lock before mutating ledger/wallet
        const lock = await acquireWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal", 300);
        if (!lock.ok) {
          throw new Error(`Wallet lock failed for charge.refunded on tip ${tipIntent.id}: ${lock.reason}`);
        }

        try {
          const tipAmount = Number(tipIntent.tip_amount ?? (tipIntent.amount as any));
          const previouslyRefunded = Number(tipIntent.refunded_amount ?? 0);
          const newRefundedTotal = Number((previouslyRefunded + refundAmount).toFixed(2));
          const isFull = newRefundedTotal >= tipAmount;
          const newRefundStatus = isFull ? "full" : "partial";

          // Build refund meta for audit
          const refundMeta = {
            action: "refund",
            tip_intent_id: tipIntent.id,
            refund_id: refundId ?? charge.id,
            payment_intent_id: tipIntent.stripe_payment_intent_id ?? null,
            slice_amount: refundAmount,
            refund_type: newRefundStatus,
            total_refunded: newRefundedTotal,
            fee: 0,
            net: -refundAmount,
            currency: charge.currency,
            event_id: event.id,
            external_id: charge.id,
          };

          // Atomic: ledger insert + tip_intent update + processed_refunds insert in one DB transaction
          const { error: rpcError } = await supabaseClient.rpc("apply_refund_slice", {
            p_tip_id: tipIntent.id,
            p_user_id: tipIntent.creator_user_id,
            p_amount: refundAmount,
            p_refund_id: refundId ?? charge.id,
            p_meta: refundMeta,
          });

          if (rpcError) {
            // If unique constraint violation → idempotent skip
            if (rpcError.message?.includes("processed_refunds_pkey") || rpcError.code === "23505") {
              console.log("charge.refunded: duplicate caught by unique constraint", refundId);
              break;
            }
            throw new Error(`charge.refunded apply_refund_slice RPC failed: ${rpcError.message}`);
          }

          console.log(`Tip ${newRefundStatus} refund: $${refundAmount} for user ${tipIntent.creator_user_id}`);
        } catch (e) {
          console.error("Failed to record refund ledger entry for tip_intent", tipIntent.id, e);
          throw e;
        } finally {
          try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (e) {}
        }
      } else {
        const userId = (charge.metadata?.user_id as string) || null;
        if (userId) {
          // Acquire wallet lock for fallback user-based refund
          const lock = await acquireWalletLock(supabaseClient, userId, "withdrawal", 300);
          if (!lock.ok) {
            throw new Error(`Wallet lock failed for fallback refund on user ${userId}: ${lock.reason}`);
          }

          try {
            await ledgerFn({ user_id: userId, type: "tip_refunded", amount: -refundAmount, reference_id: charge.id, meta: { action: "refund", fee: 0, net: -refundAmount, currency: charge.currency, event_id: event.id, external_id: charge.id } });
            console.log(`Tip refunded: $${refundAmount} for user ${userId}`);
          } catch (e) {
            console.error("Failed to record fallback refund ledger entry for user", userId, e);
            throw e;
          } finally {
            try { await releaseWalletLock(supabaseClient, userId, "withdrawal"); } catch (e) {}
          }
        }
      }

      break;
    }

    // CREATOR PAYOUTS
    case "payout.paid": {
      const payout = event.data.object as Stripe.Payout;
      const userId = payout.metadata?.user_id as string | undefined;
      const withdrawalId = payout.metadata?.withdrawal_id as string | undefined;
      const amount = payout.amount / 100;
      if (userId) {
        // DO NOT debit the ledger here — the withdrawal API already debited
        // when it created the withdrawal. This handler only confirms delivery.

        // Mark withdrawal row as paid
        if (withdrawalId) {
          await supabaseClient
            .from("withdrawals")
            .update({ status: "paid" })
            .eq("id", withdrawalId);
        }

        console.log(`Payout completed: $${amount} for user ${userId}`);

        // Fire notification (best-effort)
        try {
          const { createNotification } = await import("@/lib/notifications");
          let fee = 0;
          let net = amount;
          if (withdrawalId) {
            const { data: wRow } = await supabaseClient
              .from("withdrawals")
              .select("fee, net")
              .eq("id", withdrawalId)
              .maybeSingle();
            if (wRow) {
              fee = Number(wRow.fee) || 0;
              net = Number(wRow.net) || amount;
            }
          }
          await createNotification({
            userId,
            type: "payout",
            title: "🏦 Payout Sent",
            body: fee > 0
              ? `$${net.toFixed(2)} has been sent to your bank (fee: $${fee.toFixed(2)})`
              : `$${amount.toFixed(2)} has been sent to your bank`,
            meta: { amount, fee, net },
          });
        } catch (_) {}
      }
      break;
    }

    case "payout.failed": {
      const payout = event.data.object as Stripe.Payout;
      const userId = payout.metadata?.user_id as string | undefined;
      const withdrawalId = payout.metadata?.withdrawal_id as string | undefined;
      console.warn(`Payout failed for user ${userId}: ${payout.failure_message}`);

      if (userId) {
        // Mark the withdrawal row as failed
        if (withdrawalId) {
          await supabaseClient
            .from("withdrawals")
            .update({ status: "failed", failure_reason: payout.failure_message ?? "Unknown error" })
            .eq("id", withdrawalId);
        }

        void triggerAIAlerts("stripe.webhook:payout_failed");

        // Acquire wallet lock before reversing balance
        const lock = await acquireWalletLock(supabaseClient, userId, "withdrawal", 300);
        if (!lock.ok) {
          throw new Error(`Wallet lock failed for payout.failed on user ${userId}: ${lock.reason}`);
        }

        try {
          // Reverse the ledger debit so the balance is restored
          const refAmt = (payout.amount ?? 0) / 100;
          if (!payout.amount || refAmt <= 0) {
            throw new Error(`payout.failed: missing or zero amount for payout ${payout.id}`);
          }
          await reversePayoutOnce({
            supabase: supabaseClient,
            userId,
            amount: refAmt,
            withdrawalId: withdrawalId ?? null,
            payoutId: payout.id,
            reason: payout.failure_message ?? "Unknown error",
            action: "payout_failed_reversal",
            eventId: event.id,
            extraMeta: {
              failure_message: payout.failure_message,
            },
          });
        } catch (e) {
          console.error("Failed to reverse ledger for failed payout:", userId, e);
          throw e;
        } finally {
          try { await releaseWalletLock(supabaseClient, userId, "withdrawal"); } catch (_e) {}
        }

        // Notify user (best-effort, after lock released)
        try {
          const { createNotification } = await import("@/lib/notifications");
          const { humanizePayoutFailure } = await import("@/lib/payoutErrors");
          const friendlyMessage = humanizePayoutFailure(payout.failure_code, payout.failure_message);
          await createNotification({
            userId,
            type: "payout_failed",
            title: "⚠️ Payout Failed",
            body: `${friendlyMessage} The funds have been returned to your balance.`,
            meta: { payout_id: payout.id, failure_message: payout.failure_message },
          });
        } catch (_) {}
      }
      break;
    }

    // ACCOUNT STATUS / CONNECT
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await supabaseClient.from("profiles").update({
        stripe_account_status: account.details_submitted ? "verified" : "incomplete",
        stripe_charges_enabled: account.charges_enabled,
        stripe_payouts_enabled: account.payouts_enabled,
        stripe_onboarding_complete: Boolean(account.charges_enabled && account.payouts_enabled),
      }).eq("stripe_account_id", account.id);

      // Sync external accounts (cards/bank accounts) to payout_methods
      if (account.charges_enabled && account.payouts_enabled) {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("user_id")
          .eq("stripe_account_id", account.id)
          .maybeSingle();

        if (profile?.user_id) {
          try {
            const { syncExternalAccounts } = await import("@/lib/syncExternalAccounts");
            await syncExternalAccounts(profile.user_id, account.id);
          } catch (e) {
            console.log("External account sync error in webhook:", e);
          }
        }
      }

      console.log(`Account updated: ${account.id} charges_enabled=${account.charges_enabled} payouts_enabled=${account.payouts_enabled}`);
      break;
    }

    case "account.application.deauthorized": {
      // event.data.object is an Application, not an Account.
      // The connected account ID is on event.account.
      const connectedAccountId = (event as any).account as string | undefined;
      if (connectedAccountId) {
        await supabaseClient.from("profiles").update({ stripe_account_status: "disconnected" }).eq("stripe_account_id", connectedAccountId);
        console.warn(`Account disconnected: ${connectedAccountId}`);
      } else {
        console.warn("account.application.deauthorized: no connected account ID found", event.id);
      }
      break;
    }

    // DISPUTES / CHARGEBACKS
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const charge = dispute.charge;
      const chargeId = typeof charge === "string" ? charge : charge?.id ?? null;
      const disputeAmount = (dispute.amount ?? 0) / 100;
      const paymentIntentId = typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : (dispute.payment_intent as Stripe.PaymentIntent)?.id ?? null;

      // Try to find the tip via payment_intent first, then charge
      let tipIntent: any = null;
      if (paymentIntentId) {
        const { data } = await supabaseClient
          .from("tip_intents")
          .select("*")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle();
        tipIntent = data;
      }
      if (!tipIntent && chargeId) {
        const { data } = await supabaseClient
          .from("tip_intents")
          .select("*")
          .eq("stripe_charge_id", chargeId)
          .maybeSingle();
        tipIntent = data;
      }

      if (!tipIntent) {
        console.error(`[ALERT] charge.dispute.created: no tip found for dispute ${dispute.id} (PI: ${paymentIntentId}, charge: ${chargeId})`);
        break;
      }

      console.error(
        `[ALERT] CHARGEBACK: dispute ${dispute.id} for $${disputeAmount} on tip ${tipIntent.id}, user ${tipIntent.creator_user_id}. Reason: ${dispute.reason}`
      );

      const lock = await acquireWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal", 300);
      if (!lock.ok) {
        throw new Error(`Wallet lock failed for dispute on user ${tipIntent.creator_user_id}: ${lock.reason}`);
      }

      try {
        // Debit the disputed amount (same as refund flow)
        await ledgerFn({
          user_id: tipIntent.creator_user_id,
          type: "tip_refunded",
          amount: -disputeAmount,
          reference_id: tipIntent.id,
          meta: {
            action: "dispute",
            tip_intent_id: tipIntent.id,
            dispute_id: dispute.id,
            payment_intent_id: paymentIntentId,
            charge_id: chargeId,
            amount: disputeAmount,
            currency: dispute.currency,
            reason: dispute.reason || "unspecified",
            event_id: event.id,
          },
        });

        // Mark tip as disputed
        await supabaseClient
          .from("tip_intents")
          .update({
            status: "disputed",
            refund_status: "full",
            refunded_amount: Number(tipIntent.tip_amount ?? (tipIntent.amount as any)),
            refund_initiated_at: null,
          })
          .eq("id", tipIntent.id);

        // Restrict creator account immediately
        const { data: walletRow } = await supabaseClient
          .from("wallets")
          .select("balance")
          .eq("user_id", tipIntent.creator_user_id)
          .maybeSingle();
        const newBalance = Number(walletRow?.balance ?? 0);
        const owedAmount = newBalance < 0 ? Math.abs(newBalance) : 0;

        await supabaseClient
          .from("profiles")
          .update({
            account_status: "restricted",
            status_reason: `chargeback_dispute_${dispute.id}`,
            ...(owedAmount > 0 ? { owed_balance: owedAmount } : {}),
          })
          .eq("user_id", tipIntent.creator_user_id);

        console.error(
          `[ALERT] Dispute processed: $${disputeAmount} debited from user ${tipIntent.creator_user_id}. Account restricted. Owed: $${owedAmount}`
        );
      } catch (e) {
        console.error(`[ALERT] charge.dispute.created: failed to process dispute ${dispute.id}:`, e);
        throw e;
      } finally {
        try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (_e) {}
      }

      // Risk engine: evaluate after dispute (will catch compound risk signals)
      try {
        const { evaluateRisk } = await import("@/lib/riskEngine");
        await evaluateRisk(supabaseClient, tipIntent.creator_user_id);
      } catch (_e) {}

      // Targeted realtime alert to privileged admins + assigned admin
      try {
        const { sendDisputeAlert, getAssignedAdmin } = await import("@/lib/disputeAlerts");
        const { supabaseAdmin: sAdmin } = await import("@/lib/supabase/admin");

        // Count existing disputes for this creator to compute severity
        const { count: disputeCount } = await supabaseClient
          .from("tip_intents")
          .select("receipt_id", { count: "exact", head: true })
          .eq("creator_user_id", tipIntent.creator_user_id)
          .eq("status", "disputed");
        const severity = (disputeCount ?? 0) >= 3 ? "high" : (disputeCount ?? 0) >= 1 ? "medium" : "low";

        const assignedAdmin = await getAssignedAdmin(sAdmin, tipIntent.receipt_id);

        await sendDisputeAlert(sAdmin, {
          receipt_id: tipIntent.receipt_id,
          amount: disputeAmount,
          creator_id: tipIntent.creator_user_id,
          severity,
          reason: dispute.reason || undefined,
          event: "new_dispute",
        }, assignedAdmin);
      } catch (_e) {
        console.error("[dispute-alert] Failed to send realtime alert:", _e);
      }

      // Timeline event: dispute created (system)
      try {
        const { logDisputeEvent } = await import("@/lib/disputeEvents");
        await logDisputeEvent(
          supabaseClient,
          tipIntent.receipt_id,
          "system",
          `Dispute created — $${disputeAmount.toFixed(2)} chargeback (${dispute.reason || "unspecified"})`,
          null,
          { stripe_dispute_id: dispute.id, amount: disputeAmount, reason: dispute.reason },
        );
      } catch (_e) {}

      break;
    }

    // THEME PURCHASES
    case "checkout.session.completed": {
      const session = event.data.object as any;
      const theme = session.metadata?.theme;
      const userId = session.metadata?.userId;
      const purchaseType = session.metadata?.type;

      // ── Preset theme purchase (string key, e.g. "army_black") ──────────────
      if (purchaseType === "theme_purchase" && theme && userId) {
        if (session.payment_status !== "paid") {
          console.warn(`Skipping unpaid preset theme checkout session ${session.id}`);
          break;
        }
        try {
          const PACK_THEMES: Record<string, string[]> = {
            army_pack: ["army_black", "army_pink", "army_red"],
            imher_pack: ["pink_luxe", "ice_blue", "lavender", "peach", "glitter"],
          };
          const themesToInsert = PACK_THEMES[theme] ?? [theme];

          for (const t of themesToInsert) {
            await supabaseClient.from("theme_purchases").upsert(
              {
                user_id: userId,
                theme: t,
                stripe_session_id: session.id,
                amount: Math.round((session.amount_total ?? 0) / themesToInsert.length),
              },
              { onConflict: "user_id,theme" }
            );
          }
          console.log(`Preset theme unlocked: ${theme} (${themesToInsert.join(", ")}) for user ${userId}`);
        } catch (e) {
          console.error("Failed to unlock preset theme:", e);
        }
      }

      // ── Custom (builder) theme purchase (UUID theme_id) ─────────────────────
      if (purchaseType === "custom_theme_purchase") {
        const buyerId  = session.metadata?.buyer_id  as string | undefined;
        const sellerId = session.metadata?.seller_id as string | undefined;
        const themeId  = session.metadata?.theme_id  as string | undefined;

        if (buyerId && sellerId && themeId) {
          try {
            if (session.payment_status !== "paid") {
              console.warn(`Skipping unpaid custom theme checkout session ${session.id}`);
              break;
            }

            const amountDollars = (session.amount_total ?? 0) / 100;
            const feeCents      = parseInt(session.metadata?.platform_fee_cents ?? "0", 10);
            const platformFee   = feeCents / 100;
            const creatorEarns  = amountDollars - platformFee;

            const { data: existingUnlock } = await supabaseClient
              .from("theme_unlocks")
              .select("id")
              .eq("user_id", buyerId)
              .eq("theme_id", themeId)
              .maybeSingle();

            if (existingUnlock) {
              console.log(`Custom theme ${themeId} already unlocked for buyer ${buyerId}`);
              break;
            }

            const { data: snapshotTheme } = await supabaseClient
              .from("themes")
              .select("id, user_id, name, config, parent_theme_id")
              .eq("id", themeId)
              .maybeSingle();

            const payoutSellerId = snapshotTheme?.user_id ?? sellerId;
            if (!payoutSellerId || payoutSellerId === buyerId) {
              console.error(`Invalid custom theme payout attribution for session ${session.id}`, {
                buyerId,
                metadataSellerId: sellerId,
                snapshotSellerId: snapshotTheme?.user_id ?? null,
                themeId,
              });
              break;
            }

            // Idempotent: unique index (user_id, theme_id) silently drops dups.
            const { error: unlockErr } = await supabaseClient
              .from("theme_unlocks")
              .upsert(
                {
                  user_id: buyerId,
                  theme_id: themeId,
                  creator_id: payoutSellerId,
                  theme_name: snapshotTheme?.name ?? null,
                  theme_config: snapshotTheme?.config ?? null,
                  parent_theme_id: snapshotTheme?.parent_theme_id ?? null,
                  unlocked_via: "payment",
                  source: "payment",
                  amount_paid: amountDollars,
                },
                { onConflict: "user_id,theme_id", ignoreDuplicates: true }
              );

            if (!unlockErr) {
              await supabaseClient.from("user_theme_activity").insert({
                user_id: buyerId,
                theme_id: themeId,
                creator_id: payoutSellerId,
                action: "purchase",
                category_slug: null,
                animation_type: typeof snapshotTheme?.config === "object" && snapshotTheme?.config
                  ? (typeof (snapshotTheme.config as Record<string, unknown>).motion === "string"
                      ? (snapshotTheme.config as Record<string, unknown>).motion
                      : typeof (snapshotTheme.config as Record<string, unknown>).animationType === "string"
                        ? (snapshotTheme.config as Record<string, unknown>).animationType
                        : typeof (snapshotTheme.config as Record<string, unknown>).animation === "string"
                          ? (snapshotTheme.config as Record<string, unknown>).animation
                          : null)
                  : null,
                price: amountDollars,
              });

              // Revenue record
              const { error: saleErr } = await supabaseClient.from("theme_sales").insert({
                theme_id: themeId,
                buyer_id: buyerId,
                seller_id: payoutSellerId,
                stripe_session_id: session.id,
                amount: amountDollars,
                platform_fee: platformFee,
                creator_earnings: creatorEarns,
              });

              if (saleErr) {
                console.error("Failed to insert theme_sale; creator earnings not recorded", {
                  sessionId: session.id,
                  buyerId,
                  sellerId: payoutSellerId,
                  themeId,
                  error: saleErr.message,
                });
                break;
              }

              // Increment unlock counter (best-effort)
              await supabaseClient.rpc("increment_theme_unlock", { theme_id_input: themeId });

              // Notify creator: their theme was sold
              void createNotification({
                userId: payoutSellerId,
                type: "theme_sold",
                title: "Theme sold \ud83c\udf89",
                body: `${snapshotTheme?.name ?? "Your theme"} was purchased`,
                category: "sales",
                actorId: buyerId,
                entityId: themeId,
                meta: { amount: amountDollars },
              });

              // Notify buyer: their theme is now unlocked
              void createNotification({
                userId: buyerId,
                type: "theme_unlocked",
                title: "Theme unlocked \ud83c\udfa8",
                body: `${snapshotTheme?.name ?? "A theme"} has been added to your library`,
                category: "sales",
                actorId: payoutSellerId,
                entityId: themeId,
              });

              console.log(`Custom theme ${themeId} unlocked for buyer ${buyerId}; creator earns $${creatorEarns.toFixed(2)}`);
            }
          } catch (e) {
            console.error("Failed to unlock custom theme:", e);
          }
        }
      }

      // ── Creator Store subscription ────────────────────────────────────────
      if (purchaseType === "store_subscription") {
        const storeUserId = session.metadata?.user_id as string | undefined;
        const subscriptionId = session.subscription as string | undefined;
        const stripeInvoiceId = typeof session.invoice === "string" ? session.invoice : null;

        if (storeUserId && subscriptionId) {
          try {
            const { stripe } = await import("@/lib/stripe/server");
            const sub = await stripe.subscriptions.retrieve(subscriptionId) as unknown as { current_period_end?: number };
            const renewsAt = sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null;

            const { error: upsertErr } = await supabaseClient
              .from("creator_stores")
              .upsert(
                {
                  user_id:                storeUserId,
                  is_active:              true,
                  billing_type:           "stripe",
                  billing_status:         "active",
                  grace_until:            null,
                  renews_at:              renewsAt,
                  stripe_subscription_id: subscriptionId,
                  updated_at:             new Date().toISOString(),
                },
                { onConflict: "user_id" }
              );

            if (upsertErr) {
              await supabaseClient
                .from("creator_stores")
                .upsert(
                  {
                    user_id:                storeUserId,
                    is_active:              true,
                    stripe_subscription_id: subscriptionId,
                    updated_at:             new Date().toISOString(),
                  },
                  { onConflict: "user_id" }
                );
            }

            const { data: storeRow } = await supabaseClient
              .from("creator_stores")
              .select("id")
              .eq("user_id", storeUserId)
              .maybeSingle();

            if (stripeInvoiceId) {
              const invoicePayload = {
                user_id: storeUserId,
                store_id: storeRow?.id ?? null,
                amount: (session.amount_total ?? 0) / 100,
                status: "pending",
                billing_type: "stripe",
                stripe_invoice_id: stripeInvoiceId,
              };

              const { data: existingInvoice } = await supabaseClient
                .from("store_invoices")
                .select("id")
                .eq("stripe_invoice_id", stripeInvoiceId)
                .maybeSingle();

              if (existingInvoice?.id) {
                await supabaseClient
                  .from("store_invoices")
                  .update(invoicePayload)
                  .eq("id", existingInvoice.id);
              } else {
                await supabaseClient
                  .from("store_invoices")
                  .insert(invoicePayload);
              }
            }
            console.log(`Creator store activated for user ${storeUserId} (sub: ${subscriptionId})`);
          } catch (e) {
            console.error("Failed to activate creator store:", e);
          }
        }
      }

      break;
    }

    // CREATOR STORE invoices
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
      const stripeInvoiceId = invoice.id;

      try {
        let storeId: string | null = null;
        let ownerUserId: string | null = (invoice.metadata?.user_id as string) || null;

        if (subscriptionId) {
          const { data: store } = await supabaseClient
            .from("creator_stores")
            .select("id, user_id")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle();

          if (store) {
            storeId = store.id;
            ownerUserId = ownerUserId ?? store.user_id;
          }
        }

        if (storeId) {
          await supabaseClient
            .from("creator_stores")
            .update({
              is_active: true,
              billing_status: "active",
              grace_until: null,
              renews_at: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", storeId);

          // Re-publish themes that were hidden when subscription lapsed
          await supabaseClient
            .from("themes")
            .update({ is_public: true })
            .eq("store_id", storeId)
            .eq("is_market_active", true);
        }

        if (ownerUserId) {
          const invoicePayload = {
            user_id: ownerUserId,
            store_id: storeId,
            amount: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
            status: "paid",
            billing_type: "stripe",
            stripe_invoice_id: stripeInvoiceId,
            paid_at: new Date().toISOString(),
          };

          const { data: existingInvoice } = await supabaseClient
            .from("store_invoices")
            .select("id")
            .eq("stripe_invoice_id", stripeInvoiceId)
            .maybeSingle();

          if (existingInvoice?.id) {
            await supabaseClient
              .from("store_invoices")
              .update(invoicePayload)
              .eq("id", existingInvoice.id);
          } else {
            await supabaseClient
              .from("store_invoices")
              .insert(invoicePayload);
          }
        }
      } catch (e) {
        console.error("Failed to process invoice.payment_succeeded:", e);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
      const stripeInvoiceId = invoice.id;
      const graceUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      try {
        let storeId: string | null = null;
        let ownerUserId: string | null = (invoice.metadata?.user_id as string) || null;

        if (subscriptionId) {
          const { data: store } = await supabaseClient
            .from("creator_stores")
            .select("id, user_id")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle();

          if (store) {
            storeId = store.id;
            ownerUserId = ownerUserId ?? store.user_id;
          }
        }

        if (storeId) {
          await supabaseClient
            .from("creator_stores")
            .update({
              billing_status: "past_due",
              grace_until: graceUntil,
              updated_at: new Date().toISOString(),
            })
            .eq("id", storeId);
        }

        if (ownerUserId) {
          const invoicePayload = {
            user_id: ownerUserId,
            store_id: storeId,
            amount: (invoice.amount_due ?? 0) / 100,
            status: "failed",
            billing_type: "stripe",
            stripe_invoice_id: stripeInvoiceId,
          };

          const { data: existingInvoice } = await supabaseClient
            .from("store_invoices")
            .select("id")
            .eq("stripe_invoice_id", stripeInvoiceId)
            .maybeSingle();

          if (existingInvoice?.id) {
            await supabaseClient
              .from("store_invoices")
              .update(invoicePayload)
              .eq("id", existingInvoice.id);
          } else {
            await supabaseClient
              .from("store_invoices")
              .insert(invoicePayload);
          }
        }
      } catch (e) {
        console.error("Failed to process invoice.payment_failed:", e);
      }
      break;
    }

    // CREATOR STORE — subscription cancelled / payment failed
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      try {
        // Deactivate the store and unpublish all its themes
        const { data: store } = await supabaseClient
          .from("creator_stores")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        if (store) {
          const { error: deactivateErr } = await supabaseClient
            .from("creator_stores")
            .update({
              is_active: false,
              billing_status: "canceled",
              grace_until: null,
              stripe_subscription_id: null,
              renews_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", store.id);

          if (deactivateErr) {
            await supabaseClient
              .from("creator_stores")
              .update({
                is_active: false,
                stripe_subscription_id: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", store.id);
          }

          // Hide themes from store feed — preserve store_id so they auto-restore on renewal
          await supabaseClient
            .from("themes")
            .update({ is_market_active: false, is_public: false })
            .eq("store_id", store.id);

          console.log(`Creator store ${store.id} deactivated (sub ${sub.id} cancelled)`);
        }
      } catch (e) {
        console.error("Failed to deactivate creator store:", e);
      }
      break;
    }
    // CREATOR STORE — subscription updated (plan change, pause, payment status change)
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as Stripe.Subscription & { current_period_end?: number };
      try {
        const { data: store } = await supabaseClient
          .from("creator_stores")
          .select("id, user_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        if (store) {
          const renewsAt = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

          // Map Stripe subscription status to our billing_status
          let billingStatus: string;
          let isActive: boolean;
          if (sub.status === "active") {
            billingStatus = "active";
            isActive = true;
          } else if (sub.status === "past_due") {
            billingStatus = "past_due";
            isActive = true; // stays visible during grace
          } else if (sub.status === "canceled" || sub.status === "unpaid") {
            billingStatus = "canceled";
            isActive = false;
          } else {
            // paused, incomplete, trialing — keep current is_active, update renews_at
            billingStatus = sub.status;
            isActive = sub.status !== "paused";
          }

          await supabaseClient
            .from("creator_stores")
            .update({
              billing_status: billingStatus,
              is_active: isActive,
              renews_at: renewsAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", store.id);

          // Hide themes from store feed — preserve store_id so they auto-restore on renewal
          if (!isActive) {
            await supabaseClient
              .from("themes")
              .update({ is_market_active: false, is_public: false })
              .eq("store_id", store.id);
          }

          console.log(`Creator store ${store.id} updated: ${sub.status} (sub ${sub.id})`);
        }
      } catch (e) {
        console.error("Failed to handle customer.subscription.updated:", e);
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  await markProcessed(supabaseClient, event.id, event.type);
}
