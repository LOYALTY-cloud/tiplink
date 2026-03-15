import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addLedgerEntry } from "@/lib/ledger";
import type Stripe from "stripe";
import type { StripeWebhookEvent } from "@/types/stripe";
import type { CardRow, WalletRow, ProfileRow } from "@/types/db";

export const runtime = "nodejs";

const DECLINE_THRESHOLD = 5; // declines in window to auto-freeze
const DECLINE_WINDOW_SECONDS = 60;

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature")!;
  let event: StripeWebhookEvent;

  const stripe = getStripe();

  try {
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_ISSUING_WEBHOOK_SECRET!) as unknown as StripeWebhookEvent;
  } catch (err: unknown) {
    const sigErr = err instanceof Error ? err.message : String(err ?? "Webhook error");
    return NextResponse.json({ error: `Webhook Error: ${sigErr}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "issuing_authorization.request": {
        const auth = event.data.object as Stripe.Issuing.Authorization;

        const cardId = typeof auth.card === "string" ? auth.card : (auth.card as Stripe.Issuing.Card)?.id ?? null;

        const { data: card } = await supabaseAdmin
          .from("cards")
          .select("user_id,weekly_limit,monthly_limit,status")
          .eq("stripe_card_id", cardId)
          .maybeSingle()
          .returns<CardRow | null>();

        if (!card || card.status !== "active") {
          await logDecline(card?.user_id, auth.id, "card_inactive");
          try { await stripe.issuing.authorizations.decline(auth.id); } catch (e) {}
          return NextResponse.json({ received: true, approved: false });
        }

        const { data: wallet } = await supabaseAdmin
          .from("wallets")
          .select("available")
          .eq("user_id", card.user_id)
          .maybeSingle()
          .returns<WalletRow | null>();

        const walletAvailable = Number((wallet?.available ?? 0) as number);
        const amountUsd = Number(((auth.amount ?? 0) / 100).toFixed(2));

        if (walletAvailable < amountUsd) {
          await logDecline(card.user_id, auth.id, "insufficient_funds");
          try { await stripe.issuing.authorizations.decline(auth.id); } catch (e) {}
          return NextResponse.json({ received: true, approved: false });
        }

        // weekly limit check
        try {
          const { data: weeklyRes } = await supabaseAdmin.rpc("get_weekly_card_spend", { p_user_id: card.user_id });
          let weeklySpend = 0;
          if (weeklyRes) {
            if (Array.isArray(weeklyRes) && weeklyRes.length > 0) {
              const row = weeklyRes[0] as any;
              weeklySpend = Number(Object.values(row)[0] ?? 0);
            } else {
              weeklySpend = Number(weeklyRes as any ?? 0);
            }
          }

          if (Number(weeklySpend) + amountUsd > Number(card.weekly_limit)) {
            await logDecline(card.user_id, auth.id, "weekly_limit_exceeded");
            try { await stripe.issuing.authorizations.decline(auth.id); } catch (e) {}
            return NextResponse.json({ received: true, approved: false });
          }
        } catch (e) { console.error("Weekly limit check failed:", e); }

        // monthly limit check
        try {
          const { data: monthlyRes } = await supabaseAdmin.rpc("get_monthly_card_spend", { p_user_id: card.user_id });
          let monthlySpend = 0;
          if (monthlyRes) {
            if (Array.isArray(monthlyRes) && monthlyRes.length > 0) {
              const row = monthlyRes[0] as any;
              monthlySpend = Number(Object.values(row)[0] ?? 0);
            } else {
              monthlySpend = Number(monthlyRes as any ?? 0);
            }
          }

          if (Number(monthlySpend) + amountUsd > Number(card.monthly_limit)) {
            await logDecline(card.user_id, auth.id, "monthly_limit_exceeded");
            try { await stripe.issuing.authorizations.decline(auth.id); } catch (e) {}
            return NextResponse.json({ received: true, approved: false });
          }
        } catch (e) { console.error("Monthly limit check failed:", e); }

        // approve: deduct, ledger, record transaction
        try {
          await stripe.issuing.authorizations.approve(auth.id as string);
        } catch (e) { console.error("Stripe approve failed:", e); }

        const newAvailable = Number((walletAvailable - amountUsd).toFixed(2));
        await supabaseAdmin.from("wallets").update({ available: newAvailable }).eq("user_id", card.user_id);

        try {
          if (card.user_id) {
            await addLedgerEntry({
              user_id: card.user_id,
              type: "card_charge",
              amount: Number((-amountUsd).toFixed(2)),
              reference_id: auth.id,
              metadata: { card_id: cardId }
            });
          } else {
            console.warn("Skipping ledger entry: missing user_id for card", cardId);
          }
        } catch (e) {
          console.error("Failed to add ledger entry for authorization approval:", e);
          try { await stripe.issuing.authorizations.decline(auth.id as string); } catch (e) {}
          return NextResponse.json({ received: true, error: "Failed to record ledger entry" }, { status: 500 });
        }

        try {
            await supabaseAdmin.from("card_transactions").insert({
            user_id: card.user_id,
            stripe_authorization_id: auth.id,
            merchant_name: (auth.merchant_data as any)?.name ?? null,
            amount: amountUsd,
            currency: auth.currency ?? "usd",
            status: "approved"
          });
        } catch (e) { console.error("Failed to insert card transaction:", e); }

        return NextResponse.json({ received: true, approved: true });
      }

      case "issuing_authorization.updated": {
        const auth = event.data.object as Stripe.Issuing.Authorization;
        try {
          await supabaseAdmin.from("card_transactions").update({ status: auth.status }).eq("stripe_authorization_id", auth.id);
        } catch (e) { console.error("Failed to sync issuing_authorization.updated:", e); }
        return NextResponse.json({ received: true });
      }

      case "issuing_transaction.created": {
        const tx = event.data.object as Stripe.Issuing.Transaction;

        const cardId = typeof tx.card === "string" ? tx.card : (tx.card as Stripe.Issuing.Card)?.id ?? null;
        let userId: string | null = null;
        try {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("stripe_card_id", cardId)
            .maybeSingle()
            .returns<import("@/types/db").ProfileRow | null>();
            userId = prof?.user_id ?? null;
        } catch (e) { console.error("Profile lookup failed for issuing_transaction.created:", e); }

        const amountUsd = Number(((tx.amount ?? 0) / 100).toFixed(2));

        try {
          if (userId) {
            await addLedgerEntry({
              user_id: userId,
              type: "card_charge",
              amount: Number((-amountUsd).toFixed(2)),
              reference_id: tx.id,
              metadata: { authorization_id: (tx.authorization as Stripe.Issuing.Authorization)?.id ?? null, card_id: cardId }
            });
          } else {
            console.warn("Skipping ledger entry for issuing_transaction.created: missing userId", tx.id);
          }
        } catch (e) { console.error("Failed to add ledger entry for issuing_transaction.created:", e); }

        try {
            await supabaseAdmin.from("card_transactions").insert({
            user_id: userId,
            stripe_transaction_id: tx.id,
            stripe_authorization_id: (tx.authorization as Stripe.Issuing.Authorization)?.id ?? null,
            merchant_name: (tx.merchant_data as any)?.name ?? "unknown",
            amount: amountUsd,
            currency: tx.currency ?? "usd",
            status: (tx as any)?.status ?? null
          });
        } catch (e) { console.error("Failed to insert card transaction for issuing_transaction.created:", e); }

        return NextResponse.json({ received: true });
      }

      case "issuing_transaction.updated": {
        const tx = event.data.object as Stripe.Issuing.Transaction;
        try {
          await supabaseAdmin.from("card_transactions").update({ status: (tx as any)?.status ?? null }).eq("stripe_transaction_id", tx.id);

          if ((tx as any)?.status === "reversed") {
            const amountUsd = Number(((tx.amount ?? 0) / 100).toFixed(2));
            try {
              // if we can find user by card, credit them; otherwise skip ledger
              let reversalUserId: string | null = null;
              try {
                const cardId = typeof tx.card === "string" ? tx.card : (tx.card as Stripe.Issuing.Card)?.id ?? null;
                const { data: prof } = await supabaseAdmin
                  .from("profiles")
                  .select("user_id")
                  .eq("stripe_card_id", cardId)
                  .maybeSingle()
                  .returns<ProfileRow | null>();
                reversalUserId = prof?.user_id ?? null;
              } catch (e) { console.error("Failed to lookup user for reversal ledger entry:", e); }

              if (reversalUserId) {
                await addLedgerEntry({ user_id: reversalUserId, type: "card_reversal", amount: Number((amountUsd).toFixed(2)), reference_id: tx.id, metadata: { authorization_id: (tx.authorization as Stripe.Issuing.Authorization)?.id ?? null } });
              } else {
                console.warn("Skipping reversal ledger entry: no user found for transaction", tx.id);
              }
            } catch (e) { console.error("Failed to add reversal ledger entry:", e); }
          }
        } catch (e) { console.error("Failed to handle issuing_transaction.updated:", e); }
        return NextResponse.json({ received: true });
      }

      case "issuing_card.updated": {
        const card = event.data.object as Stripe.Issuing.Card;
        try {
          await supabaseAdmin.from("cards").update({ status: card.status }).eq("stripe_card_id", card.id);
        } catch (e) { console.error("Failed to sync issuing_card.updated:", e); }
        return NextResponse.json({ received: true });
      }

      default:
        console.log(`Unhandled issuing event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("Error processing issuing webhook event:", err);
    const errMsg = err instanceof Error ? err.message : String(err ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

async function logDecline(user_id: string | undefined, authId: string, reason: string) {
  if (!user_id) return;
  try {
    await supabaseAdmin.from("card_declines").insert({ user_id, stripe_authorization_id: authId, reason });

    const since = new Date(Date.now() - DECLINE_WINDOW_SECONDS * 1000).toISOString();
    const { data: recentDeclines } = await supabaseAdmin
      .from("card_declines")
      .select("id")
      .eq("user_id", user_id)
      .gt("created_at", since);

    if (recentDeclines && recentDeclines.length >= DECLINE_THRESHOLD) {
      await supabaseAdmin.from("cards").update({ status: "inactive" }).eq("user_id", user_id);
    }
  } catch (e) {
    console.error("Failed to log decline or auto-freeze:", e);
  }
}
