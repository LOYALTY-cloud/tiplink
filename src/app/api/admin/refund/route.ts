import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1. Authenticate admin
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const adminId = await getAdminFromSession(jwt);
    if (!adminId) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });

    // 2. Parse body
    const body = await req.json();
    const { tip_intent_id, amount } = body;
    if (!tip_intent_id) return NextResponse.json({ error: "Missing tip_intent_id" }, { status: 400 });

    // 3. Load the tip
    const { data: tip, error: tipErr } = await supabaseAdmin
      .from("tip_intents")
      .select("id, stripe_payment_intent_id, tip_amount, refunded_amount, refund_status, creator_user_id, status")
      .eq("id", tip_intent_id)
      .maybeSingle();

    if (tipErr) return NextResponse.json({ error: tipErr.message }, { status: 500 });
    if (!tip) return NextResponse.json({ error: "Tip not found" }, { status: 404 });
    if (!tip.stripe_payment_intent_id) return NextResponse.json({ error: "No Stripe PaymentIntent linked to this tip" }, { status: 400 });

    // 4. Guard: already fully refunded
    if (tip.refund_status === "full") {
      return NextResponse.json({ error: "Tip already fully refunded" }, { status: 400 });
    }

    // 5. Determine refund amount
    const tipAmount = Number(tip.tip_amount ?? 0);
    const alreadyRefunded = Number(tip.refunded_amount ?? 0);
    const maxRefundable = Number((tipAmount - alreadyRefunded).toFixed(2));

    const refundAmt = amount != null ? Number(amount) : maxRefundable;

    if (refundAmt <= 0) return NextResponse.json({ error: "Nothing to refund" }, { status: 400 });
    if (refundAmt > maxRefundable) {
      return NextResponse.json(
        { error: `Refund amount $${refundAmt} exceeds refundable balance of $${maxRefundable}` },
        { status: 400 }
      );
    }

    // 6. Check creator wallet — no negative balances
    const { data: walletRow } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", tip.creator_user_id)
      .maybeSingle();

    const creatorBalance = Number(walletRow?.balance ?? 0);
    if (refundAmt > creatorBalance) {
      return NextResponse.json(
        { error: `Insufficient creator balance ($${creatorBalance.toFixed(2)}) to cover refund of $${refundAmt.toFixed(2)}` },
        { status: 409 }
      );
    }

    // 7. Mark as initiated so withdrawal protection can see it before webhook fires
    await supabaseAdmin
      .from("tip_intents")
      .update({ refund_status: "initiated" })
      .eq("id", tip.id);

    // 8. Create Stripe refund — webhook handles ledger debit
    const { stripe } = await import("@/lib/stripe/server");
    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create({
        payment_intent: tip.stripe_payment_intent_id,
        amount: Math.round(refundAmt * 100),
        metadata: {
          tip_intent_id: tip.id,
          admin_id: adminId,
          initiated_at: new Date().toISOString(),
        },
      });
    } catch (e: unknown) {
      // Roll back initiated status if Stripe call fails
      await supabaseAdmin
        .from("tip_intents")
        .update({ refund_status: alreadyRefunded > 0 ? "partial" : "none" })
        .eq("id", tip.id);
      const errMsg = e instanceof Error ? e.message : String(e ?? "Stripe refund failed");
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      refund_id: stripeRefund.id,
      amount: refundAmt,
      status: stripeRefund.status,
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
