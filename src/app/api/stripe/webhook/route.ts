import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addLedgerEntry } from "@/lib/ledger";
import type Stripe from "stripe";
import type { StripeWebhookEvent } from "@/types/stripe";

export const runtime = "nodejs";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function isDuplicate(eventId: string) {
  try {
    const { data } = await supabaseAdmin.from("stripe_webhook_events").select("id").eq("id", eventId).maybeSingle();
    return !!data;
  } catch (e) {
    console.error("isDuplicate check failed:", e);
    return false;
  }
}

async function markProcessed(eventId: string, type: string) {
  try {
    await supabaseAdmin.from("stripe_webhook_events").insert({ id: eventId, type, processed_at: new Date().toISOString() });
  } catch (e) {
    console.error("markProcessed failed:", e);
  }
}

export async function POST(req: NextRequest) {
  const buf = await req.arrayBuffer();
  const sig = req.headers.get("stripe-signature")!;
  let event: StripeWebhookEvent;

  try {
    event = stripe.webhooks.constructEvent(Buffer.from(buf), sig, endpointSecret) as unknown as StripeWebhookEvent;
  } catch (err: any) {
    console.error("⚠️ Webhook signature verification failed:", err?.message ?? err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (await isDuplicate(event.id)) {
    console.log("Duplicate event skipped:", event.id);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      // TIP PAYMENTS
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const userId = (pi.metadata?.user_id as string) || (pi.metadata?.creator_user_id as string) || null;
        const amount = (pi.amount_received ?? pi.amount) / 100;

        if (userId) {
          await addLedgerEntry({ user_id: userId, type: "tip_received", amount, reference_id: pi.id, metadata: { currency: pi.currency } });
          console.log(`Tip received: $${amount} for user ${userId}`);
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
        const userId = (charge.metadata?.user_id as string) || null;
        const amount = (charge.amount_refunded ?? 0) / 100;
        if (userId) {
          await addLedgerEntry({ user_id: userId, type: "tip_refunded", amount: -amount, reference_id: charge.id, metadata: { currency: charge.currency } });
          console.log(`Tip refunded: $${amount} for user ${userId}`);
        }
        break;
      }

      // CREATOR PAYOUTS
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        const userId = payout.metadata?.user_id as string | undefined;
        const amount = payout.amount / 100;
        if (userId) {
          await addLedgerEntry({ user_id: userId, type: "payout", amount: -amount, reference_id: payout.id, metadata: { currency: payout.currency } });
          console.log(`Payout completed: $${amount} for user ${userId}`);
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
        await supabaseAdmin.from("profiles").update({ stripe_account_status: account.details_submitted ? "verified" : "incomplete" }).eq("stripe_account_id", account.id);
        console.log(`Account updated: ${account.id}`);
        break;
      }

      case "account.application.deauthorized": {
        const account = event.data.object as Stripe.Account;
        await supabaseAdmin.from("profiles").update({ stripe_account_status: "disconnected" }).eq("stripe_account_id", account.id);
        console.warn(`Account disconnected: ${account.id}`);
        break;
      }

      // CARD ISSUING EVENTS
      case "issuing_authorization.request":
      case "issuing_authorization.created":
      case "issuing_authorization.updated": {
        const authObj = event.data.object as Stripe.Issuing.Authorization;
        const cardId = typeof authObj.card === "string" ? authObj.card : (authObj.card as any)?.id;

        const user = await supabaseAdmin.from("cards").select("user_id,daily_limit,monthly_limit,status").eq("stripe_card_id", cardId).maybeSingle().then(r => r.data);
        if (!user || user.status !== "active") {
          console.warn(`Card not active or not found: ${cardId}`);
          break;
        }

        const { data: dailySpend } = await supabaseAdmin.rpc("get_daily_card_spend", { p_user_id: user.user_id });
        const { data: monthlySpend } = await supabaseAdmin.rpc("get_monthly_card_spend", { p_user_id: user.user_id });

        const amount = (authObj.amount ?? 0) / 100;
        const walletRes = await supabaseAdmin.from("wallets").select("balance").eq("user_id", user.user_id).maybeSingle();

        if (!walletRes.data || walletRes.data.balance < amount) {
          await supabaseAdmin.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: false, reason: "insufficient_wallet_balance" });
          console.log(`Authorization declined (wallet) for ${user.user_id}`);
          break;
        }

        if ((dailySpend || 0) + amount > (user.daily_limit || 5000)) {
          await supabaseAdmin.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: false, reason: "daily_limit_exceeded" });
          console.log(`Authorization declined (daily limit) for ${user.user_id}`);
          break;
        }

        if ((monthlySpend || 0) + amount > (user.monthly_limit || 20000)) {
          await supabaseAdmin.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: false, reason: "monthly_limit_exceeded" });
          console.log(`Authorization declined (monthly limit) for ${user.user_id}`);
          break;
        }

        // Approve: record ledger + transaction + log
        if (user.user_id) {
          await addLedgerEntry({ user_id: user.user_id, type: "card_charge", amount: -amount, reference_id: authObj.id });
        }
        await supabaseAdmin.from("card_transactions").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, merchant_name: (authObj.merchant_data as any)?.name ?? null, amount, currency: authObj.currency ?? "usd", status: "approved" });
        await supabaseAdmin.from("issuing_logs").insert({ user_id: user.user_id, stripe_authorization_id: authObj.id, amount, approved: true });
        console.log(`Card authorization approved for ${user.user_id}`);
        break;
      }

      

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    await markProcessed(event.id, event.type);
  } catch (err: any) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
