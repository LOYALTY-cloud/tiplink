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

export const runtime = "nodejs";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function isDuplicate(supabaseClient: SupabaseClient, eventId: string) {
  try {
    const { data } = await supabaseClient.from("stripe_webhook_events").select("id").eq("id", eventId).maybeSingle();
    return !!data;
  } catch (e) {
    console.error("isDuplicate check failed:", e);
    return false;
  }
}

async function markProcessed(supabaseClient: SupabaseClient, eventId: string, type: string) {
  try {
    await supabaseClient.from("stripe_webhook_events").insert({ id: eventId, type, processed_at: new Date().toISOString() });
  } catch (e) {
    console.error("markProcessed failed:", e);
  }
}

export async function POST(req: NextRequest) {
  const { stripe } = await import("@/lib/stripe/server");

  const buf = await req.arrayBuffer();
  const sig = req.headers.get("stripe-signature")!;
  let event: StripeWebhookEvent;

  try {
    event = stripe.webhooks.constructEvent(Buffer.from(buf), sig, endpointSecret) as unknown as StripeWebhookEvent;
  } catch (err: unknown) {
    console.error("⚠️ Webhook signature verification failed:", err instanceof Error ? err.message : err);
    logCaughtError("stripe/webhook", err, { severity: "critical", metadata: { reason: "signature_verification_failed" } });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Delegate to handler so tests can call it directly.
  try {
    await handleStripeEvent(event as StripeWebhookEvent);
  } catch (err: unknown) {
    console.error("Webhook processing failed:", err);
    logCaughtError("stripe/webhook", err, { severity: "critical", metadata: { reason: "processing_failed" } });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
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
        console.warn("Could not acquire wallet lock for tip_intent, skipping processing:", tipIntent.id, lock.reason);
        break;
      }

      try {
        // Mark intent succeeded and attach Stripe PI id
        await supabaseClient
          .from("tip_intents")
          .update({ status: "succeeded", stripe_payment_intent_id: pi.id })
          .eq("id", tipIntent.id);

        // Record canonical ledger entry and trigger wallet recalculation
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
      } catch (e) {
        console.error("Failed to record ledger entry for tip_intent", tipIntent.id, e);
      } finally {
        try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (e) {}
      }

      // Risk engine: evaluate after tip (catches owed_balance auto-offset edge cases)
      try {
        const { evaluateRisk } = await import("@/lib/riskEngine");
        await evaluateRisk(supabaseClient, tipIntent.creator_user_id);
      } catch (_e) {}

      // Set 24h payout hold on new funds
      try {
        await supabaseClient
          .from("profiles")
          .update({
            payout_hold_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("user_id", tipIntent.creator_user_id);
      } catch (_) {}

      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const receiptId = (pi.metadata?.receipt_id as string) || null;
      const failureMessage = pi.last_payment_error?.message || "Payment failed";

      console.warn(`Payment failed for PI ${pi.id}: ${failureMessage}`);

      if (receiptId) {
        // Update tip_intents status + failure reason
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
        console.warn("refund.created: could not acquire wallet lock", tipIntent.id, lock.reason);
        break;
      }

      try {
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
          console.warn("Could not acquire wallet lock for refund, skipping processing:", tipIntent.id, lock.reason);
          break;
        }

        try {
          const tipAmount = Number(tipIntent.tip_amount ?? (tipIntent.amount as any));
          const previouslyRefunded = Number(tipIntent.refunded_amount ?? 0);
          const newRefundedTotal = Number((previouslyRefunded + refundAmount).toFixed(2));
          const isFull = newRefundedTotal >= tipAmount;
          const newRefundStatus = isFull ? "full" : "partial";

          // Update tip_intent with running refund totals
          await supabaseClient
            .from("tip_intents")
            .update({
              status: isFull ? "refunded" : "partially_refunded",
              refunded_amount: newRefundedTotal,
              refund_status: newRefundStatus,
              last_refund_id: charge.id,
              stripe_charge_id: charge.id,
              ...(refundId ? { processed_refund_ids: [...(tipIntent.processed_refund_ids ?? []), refundId] } : {}),
              refund_initiated_at: null, // clear gap window so withdrawal guard releases
            })
            .eq("id", tipIntent.id);

          // Ledger debit — only the new refund slice, not the cumulative total
          await ledgerFn({
            user_id: tipIntent.creator_user_id,
            type: "tip_refunded",
            amount: -refundAmount,
            reference_id: tipIntent.id,
            meta: {
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
            },
          });
          console.log(`Tip ${newRefundStatus} refund: $${refundAmount} for user ${tipIntent.creator_user_id}`);
        } catch (e) {
          console.error("Failed to record refund ledger entry for tip_intent", tipIntent.id, e);
        } finally {
          try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (e) {}
        }
      } else {
        const userId = (charge.metadata?.user_id as string) || null;
        if (userId) {
          // Acquire wallet lock for fallback user-based refund
          const lock = await acquireWalletLock(supabaseClient, userId, "withdrawal", 300);
          if (!lock.ok) {
            console.warn("Could not acquire wallet lock for fallback refund, skipping processing:", userId, lock.reason);
            break;
          }

          try {
            await ledgerFn({ user_id: userId, type: "tip_refunded", amount: -refundAmount, reference_id: charge.id, meta: { action: "refund", fee: 0, net: -refundAmount, currency: charge.currency, event_id: event.id, external_id: charge.id } });
            console.log(`Tip refunded: $${refundAmount} for user ${userId}`);
          } catch (e) {
            console.error("Failed to record fallback refund ledger entry for user", userId, e);
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
      const amount = payout.amount / 100;
      if (userId) {
        const lock = await acquireWalletLock(supabaseClient, userId, "withdrawal", 300);
        if (!lock.ok) {
          console.warn("Could not acquire wallet lock for payout, skipping ledger entry:", userId, lock.reason);
          break;
        }

        try {
          await ledgerFn({ user_id: userId, type: "payout", amount: -amount, reference_id: payout.id, meta: { action: "payout", fee: 0, net: -amount, currency: payout.currency, event_id: event.id, external_id: payout.id } });
          console.log(`Payout completed: $${amount} for user ${userId}`);

          // Fire notification (best-effort)
          try {
            const { createNotification } = await import("@/lib/notifications");
            // Look up withdrawal record for fee details
            const withdrawalId = payout.metadata?.withdrawal_id;
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
        } catch (e) {
          console.error("Failed to record payout ledger entry for user", userId, e);
        } finally {
          try { await releaseWalletLock(supabaseClient, userId, "withdrawal"); } catch (e) {}
        }
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

        // Reverse the ledger debit so the balance is restored
        try {
          const refAmt = (payout.amount ?? 0) / 100;
          await ledgerFn({
            user_id: userId,
            type: "payout_reversal",
            amount: refAmt,
            reference_id: payout.id,
            meta: {
              action: "payout_failed_reversal",
              original_payout_id: payout.id,
              failure_message: payout.failure_message,
              event_id: event.id,
            },
            status: "completed",
          });
        } catch (e) {
          console.error("Failed to reverse ledger for failed payout:", userId, e);
        }

        // Notify user
        try {
          const { createNotification } = await import("@/lib/notifications");
          await createNotification({
            userId,
            type: "payout_failed",
            title: "⚠️ Payout Failed",
            body: `Your withdrawal could not be completed: ${payout.failure_message ?? "unknown error"}. The funds have been returned to your balance.`,
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
      const account = event.data.object as Stripe.Account;
      await supabaseClient.from("profiles").update({ stripe_account_status: "disconnected" }).eq("stripe_account_id", account.id);
      console.warn(`Account disconnected: ${account.id}`);
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
        console.error(`[ALERT] charge.dispute.created: could not acquire wallet lock for user ${tipIntent.creator_user_id}`);
        break;
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
      } finally {
        try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (_e) {}
      }

      // Risk engine: evaluate after dispute (will catch compound risk signals)
      try {
        const { evaluateRisk } = await import("@/lib/riskEngine");
        await evaluateRisk(supabaseClient, tipIntent.creator_user_id);
      } catch (_e) {}

      break;
    }

    // THEME PURCHASES
    case "checkout.session.completed": {
      const session = event.data.object as any;
      const theme = session.metadata?.theme;
      const userId = session.metadata?.userId;
      const purchaseType = session.metadata?.type;

      if (purchaseType === "theme_purchase" && theme && userId) {
        try {
          await supabaseClient.from("theme_purchases").upsert(
            {
              user_id: userId,
              theme,
              stripe_session_id: session.id,
              amount: session.amount_total,
            },
            { onConflict: "user_id,theme" }
          );
          console.log(`Theme unlocked: ${theme} for user ${userId}`);
        } catch (e) {
          console.error("Failed to unlock theme:", e);
        }
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  await markProcessed(supabaseClient, event.id, event.type);
}
