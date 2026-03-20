import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { REFUND_REASONS, type RefundReason } from "@/lib/refundReasons";
import { createRiskAlert } from "@/lib/riskAlerts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1. Authenticate admin
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = await getAdminFromSession(jwt);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "refund");
    const adminId = session.userId;

    // 2. Parse body
    const body = await req.json();
    const { tip_intent_id, amount, reason, note } = body;
    if (!tip_intent_id) return NextResponse.json({ error: "Missing tip_intent_id" }, { status: 400 });
    if (!reason || !REFUND_REASONS.includes(reason as RefundReason)) {
      return NextResponse.json({ error: `Missing or invalid reason. Must be one of: ${REFUND_REASONS.join(", ")}` }, { status: 400 });
    }

    // 2.5 Rate limit: max 10 admin refunds per minute per admin
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentRefundCount } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id", { count: "exact", head: true })
      .eq("refund_status", "initiated")
      .gte("refund_initiated_at", oneMinuteAgo);
    if ((recentRefundCount ?? 0) >= 10) {
      return NextResponse.json({ error: "Rate limit exceeded: too many refunds initiated in the last minute" }, { status: 429 });
    }

    // 3. Load the tip
    const { data: tip, error: tipErr } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id, stripe_payment_intent_id, tip_amount, refunded_amount, refund_status, creator_user_id, status")
      .eq("receipt_id", tip_intent_id)
      .maybeSingle();

    if (tipErr) return NextResponse.json({ error: tipErr.message }, { status: 500 });
    if (!tip) return NextResponse.json({ error: "Tip not found" }, { status: 404 });
    if (!tip.stripe_payment_intent_id) return NextResponse.json({ error: "No Stripe PaymentIntent linked to this tip" }, { status: 400 });

    // 4. Guard: already fully refunded (optimistic lock — state must match)
    if (tip.refund_status === "full") {
      return NextResponse.json({ error: "Tip already fully refunded" }, { status: 400 });
    }
    if (tip.refund_status === "initiated") {
      return NextResponse.json({ error: "Refund already in progress — wait for webhook to complete" }, { status: 409 });
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

    // 5b. Approval threshold: >$100 requires multi-admin approval
    if (refundAmt > 100) {
      const requiresOwner = refundAmt > 350;

      // Check if there's already a pending request for this tip
      const { data: existing } = await supabaseAdmin
        .from("refund_requests")
        .select("id")
        .eq("tip_intent_id", tip.receipt_id)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "A refund request is already pending for this tip" }, { status: 409 });
      }

      await supabaseAdmin.from("refund_requests").insert({
        tip_intent_id: tip.receipt_id,
        requested_by: adminId,
        amount: refundAmt,
        required_approvals: 2,
        requires_owner: requiresOwner,
        reason,
        note: note || null,
      });

      // Log to admin_actions
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: adminId,
        action: "refund_request",
        target_user: tip.creator_user_id,
        metadata: {
          tip_intent_id: tip.receipt_id,
          amount: refundAmt,
          requires_owner: requiresOwner,
          required_approvals: 2,
          reason,
          note: note || null,
        },
        severity: "warning",
      });

      return NextResponse.json({
        ok: true,
        pending_approval: true,
        requires_owner: requiresOwner,
        message: requiresOwner
          ? `Refund of $${refundAmt.toFixed(2)} requires 2 approvals including owner`
          : `Refund of $${refundAmt.toFixed(2)} requires 2 approvals`,
      });
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
      .update({
        refund_status: "initiated",
        refund_initiated_at: new Date().toISOString(),
      })
      .eq("receipt_id", tip.receipt_id);

    // 8. Create Stripe refund — pass idempotency key to prevent duplicate calls on admin double-click
    const idempotencyKey = req.headers.get("idempotency-key") ?? `refund-${tip.receipt_id}-${Math.round(refundAmt * 100)}`;
    const { stripe } = await import("@/lib/stripe/server");
    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: tip.stripe_payment_intent_id,
          amount: Math.round(refundAmt * 100),
          metadata: {
            tip_intent_id: tip.receipt_id,
            admin_id: adminId,
            initiated_at: new Date().toISOString(),
          },
        },
        { idempotencyKey }
      );
    } catch (e: unknown) {
      // Roll back initiated status if Stripe call fails
      console.error(`[ALERT] Admin refund Stripe call failed for tip ${tip.receipt_id}:`, e);
      await supabaseAdmin
        .from("tip_intents")
        .update({ refund_status: alreadyRefunded > 0 ? "partial" : "none" })
        .eq("receipt_id", tip.receipt_id);
      const errMsg = e instanceof Error ? e.message : String(e ?? "Stripe refund failed");
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "refund",
      target_user: tip.creator_user_id,
      metadata: { tip_intent_id: tip.receipt_id, amount: refundAmt, refund_id: stripeRefund.id, reason, note: note || null },
      severity: "warning",
    });

    // Risk alert: high refund amount
    if (refundAmt > 300) {
      await createRiskAlert({
        user_id: tip.creator_user_id,
        type: "high_refund",
        message: `High refund of $${refundAmt.toFixed(2)} issued for tip ${String(tip.receipt_id).slice(0, 8)}…`,
        severity: "warning",
      });
    }

    // Risk alert: refund velocity (3+ in 24h for same user) → auto-restrict
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentUserRefunds } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("target_user", tip.creator_user_id)
      .eq("action", "refund")
      .gte("created_at", twentyFourHoursAgo);
    if ((recentUserRefunds ?? 0) >= 3) {
      await createRiskAlert({
        user_id: tip.creator_user_id,
        type: "refund_velocity",
        message: `${recentUserRefunds} refunds in 24h for user ${tip.creator_user_id.slice(0, 8)}…`,
        severity: "critical",
      });
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
