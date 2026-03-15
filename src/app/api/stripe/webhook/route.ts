import { NextRequest, NextResponse } from "next/server";
// Stripe client is only needed for signature verification in the POST handler.
// Avoid importing it at module load so tests can import `handleStripeEvent`
// without requiring STRIPE_SECRET_KEY to be set.
// ledger helper will be lazy-imported when needed so tests can inject a mock
import type Stripe from "stripe";
import type { StripeWebhookEvent } from "@/types/stripe";
import type { CardRow, WalletRow } from "@/types/db";

export const runtime = "nodejs";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function isDuplicate(supabaseClient: any, eventId: string) {
  try {
    const { data } = await supabaseClient.from("stripe_webhook_events").select("id").eq("id", eventId).maybeSingle();
    return !!data;
  } catch (e) {
    console.error("isDuplicate check failed:", e);
    return false;
  }
}

async function markProcessed(supabaseClient: any, eventId: string, type: string) {
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
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Delegate to handler so tests can call it directly.
  try {
    await handleStripeEvent(event as StripeWebhookEvent);
  } catch (err: unknown) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Exported for testing: processes a Stripe event object, performs deduplication,
// handles event types, and records the event as processed.
export async function handleStripeEvent(
  event: StripeWebhookEvent,
  supabaseClient: any = undefined,
  ledgerFn: any = undefined
) {
  if (!ledgerFn) {
    const mod = await import("@/lib/ledger");
    ledgerFn = mod.addLedgerEntry;
  }
  if (!supabaseClient) {
    const mod = await import("@/lib/supabase/admin");
    supabaseClient = mod.supabaseAdmin;
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
          metadata: { currency: pi.currency, receipt_id: receiptId },
        });

        console.log(`Tip succeeded: $${receivedAmount} for user ${tipIntent.creator_user_id}`);
      } catch (e) {
        console.error("Failed to record ledger entry for tip_intent", tipIntent.id, e);
      } finally {
        try { await releaseWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal"); } catch (e) {}
      }

      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = (pi.metadata?.user_id as string) || null;
      console.warn(`Tip failed for user ${userId}: ${pi.last_payment_error?.message}`);
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const receiptId = (charge.metadata?.receipt_id as string) || null;
      const amount = (charge.amount_refunded ?? 0) / 100;

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

        // Avoid double-processing refunds
        if (tipIntent.status === "refunded") {
          console.log("Refund already processed for tip_intent", tipIntent.id);
          break;
        }

        // Acquire wallet lock before mutating ledger/wallet
        const lock = await acquireWalletLock(supabaseClient, tipIntent.creator_user_id, "withdrawal", 300);
        if (!lock.ok) {
          console.warn("Could not acquire wallet lock for refund, skipping processing:", tipIntent.id, lock.reason);
          break;
        }

        try {
          // Mark intent refunded
          await supabaseClient.from("tip_intents").update({ status: "refunded", stripe_charge_id: charge.id }).eq("id", tipIntent.id);

          const refundedAmount = Number(tipIntent.tip_amount ?? (tipIntent.amount as any));
          await ledgerFn({ user_id: tipIntent.creator_user_id, type: "tip_refunded", amount: -refundedAmount, reference_id: tipIntent.id, metadata: { currency: charge.currency } });
          console.log(`Tip refunded: $${refundedAmount} for user ${tipIntent.creator_user_id}`);
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
            await ledgerFn({ user_id: userId, type: "tip_refunded", amount: -amount, reference_id: charge.id, metadata: { currency: charge.currency } });
            console.log(`Tip refunded: $${amount} for user ${userId}`);
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
          await ledgerFn({ user_id: userId, type: "payout", amount: -amount, reference_id: payout.id, metadata: { currency: payout.currency } });
          console.log(`Payout completed: $${amount} for user ${userId}`);
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
      console.warn(`Payout failed for user ${userId}: ${payout.failure_message}`);
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
      console.log(`Account updated: ${account.id}`);
      break;
    }

    case "account.application.deauthorized": {
      const account = event.data.object as Stripe.Account;
      await supabaseClient.from("profiles").update({ stripe_account_status: "disconnected" }).eq("stripe_account_id", account.id);
      console.warn(`Account disconnected: ${account.id}`);
      break;
    }

    // CARD ISSUING EVENTS
    case "issuing_authorization.request":
    case "issuing_authorization.created":
    case "issuing_authorization.updated": {
      const authObj = event.data.object as Stripe.Issuing.Authorization;
      const cardId = typeof authObj.card === "string" ? authObj.card : (authObj.card as Stripe.Issuing.Card)?.id;

      const userRes = await supabaseClient
        .from("cards")
        .select("user_id,daily_limit,monthly_limit,status")
        .eq("stripe_card_id", cardId)
        .maybeSingle();

      const user = userRes.data as CardRow | null;

      if (!user || user.status !== "active") {
        console.warn(`Card not active or not found: ${cardId}`);
        break;
      }

      const { data: dailySpend } = await supabaseClient.rpc("get_daily_card_spend", { p_user_id: user.user_id });
      const { data: monthlySpend } = await supabaseClient.rpc("get_monthly_card_spend", { p_user_id: user.user_id });

      const amount = (authObj.amount ?? 0) / 100;
      const { data: walletRes } = await supabaseClient
        .from("wallets")
        .select("balance")
        .eq("user_id", user.user_id)
        .maybeSingle()
        .returns<WalletRow | null>();

      if (!walletRes || walletRes.balance < amount) {
        await supabaseClient.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: false, reason: "insufficient_wallet_balance" });
        console.log(`Authorization declined (wallet) for ${user.user_id}`);
        break;
      }

      if ((dailySpend || 0) + amount > (user.daily_limit || 5000)) {
        await supabaseClient.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: false, reason: "daily_limit_exceeded" });
        console.log(`Authorization declined (daily limit) for ${user.user_id}`);
        break;
      }

      if ((monthlySpend || 0) + amount > (user.monthly_limit || 20000)) {
        await supabaseClient.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: false, reason: "monthly_limit_exceeded" });
        console.log(`Authorization declined (monthly limit) for ${user.user_id}`);
        break;
      }

      // Approve: record ledger + transaction + log
      if (user.user_id) {
        const lock = await acquireWalletLock(supabaseClient, user.user_id, "withdrawal", 300);
        if (!lock.ok) {
          console.warn("Could not acquire wallet lock for card charge, skipping ledger entry:", user.user_id, lock.reason);
          break;
        }

        try {
          await ledgerFn({ user_id: user.user_id, type: "card_charge", amount: -amount, reference_id: authObj.id });
          await supabaseClient.from("card_transactions").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, merchant_name: (authObj.merchant_data as any)?.name ?? null, amount, currency: authObj.currency ?? "usd", status: "approved" });
          await supabaseClient.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: true });
          console.log(`Card authorization approved for ${user.user_id}`);
        } catch (e) {
          console.error("Failed to process card authorization for user", user.user_id, e);
        } finally {
          try { await releaseWalletLock(supabaseClient, user.user_id, "withdrawal"); } catch (e) {}
        }
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  await markProcessed(supabaseClient, event.id, event.type);
}
