import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET /api/admin/refund/retry — List stale initiated refunds (>10 min old)
 * POST /api/admin/refund/retry — Retry a specific stale refund by tip_intent_id
 */

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = await getAdminFromSession(jwt);
  if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  requireRole(session.role, "refund");

  // Find all tips stuck in "initiated" for more than 10 minutes
  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleTips, error } = await supabaseAdmin
    .from("tip_intents")
    .select("receipt_id, creator_user_id, tip_amount, refunded_amount, refund_status, refund_initiated_at, stripe_payment_intent_id")
    .eq("refund_status", "initiated")
    .lt("refund_initiated_at", staleCutoff)
    .order("refund_initiated_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    stale_refunds: (staleTips ?? []).map((t) => ({
      tip_intent_id: t.receipt_id,
      creator_user_id: t.creator_user_id,
      tip_amount: t.tip_amount,
      refunded_amount: t.refunded_amount,
      initiated_at: t.refund_initiated_at,
      stripe_payment_intent_id: t.stripe_payment_intent_id,
      owed: Number(t.tip_amount ?? 0) - Number(t.refunded_amount ?? 0),
    })),
  });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = await getAdminFromSession(jwt);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "refund");
    const adminId = session.userId;

    const body = await req.json();
    const { tip_intent_id } = body;
    if (!tip_intent_id) return NextResponse.json({ error: "Missing tip_intent_id" }, { status: 400 });

    // Load the stale tip
    const { data: tip, error: tipErr } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id, stripe_payment_intent_id, tip_amount, refunded_amount, refund_status, refund_initiated_at, creator_user_id")
      .eq("receipt_id", tip_intent_id)
      .maybeSingle();

    if (tipErr) return NextResponse.json({ error: tipErr.message }, { status: 500 });
    if (!tip) return NextResponse.json({ error: "Tip not found" }, { status: 404 });

    // Only retry tips stuck in "initiated"
    if (tip.refund_status !== "initiated") {
      return NextResponse.json({ error: `Tip refund_status is '${tip.refund_status}', not 'initiated'` }, { status: 400 });
    }

    // Verify it's actually stale (>10 min)
    const initiatedAt = tip.refund_initiated_at ? new Date(tip.refund_initiated_at).getTime() : 0;
    if (Date.now() - initiatedAt < 10 * 60 * 1000) {
      return NextResponse.json({ error: "Refund is still within the 10-minute processing window" }, { status: 409 });
    }

    if (!tip.stripe_payment_intent_id) {
      return NextResponse.json({ error: "No Stripe PaymentIntent linked to this tip" }, { status: 400 });
    }

    const tipAmount = Number(tip.tip_amount ?? 0);
    const alreadyRefunded = Number(tip.refunded_amount ?? 0);
    const owed = Number((tipAmount - alreadyRefunded).toFixed(2));

    if (owed <= 0) {
      // Already fully refunded — clear the stale initiated status
      await supabaseAdmin
        .from("tip_intents")
        .update({ refund_status: "full", refund_initiated_at: null })
        .eq("receipt_id", tip.receipt_id);
      return NextResponse.json({ error: "Nothing owed — cleared stale initiated status" }, { status: 400 });
    }

    // Retry the Stripe refund with a deterministic idempotency key
    const idempotencyKey = `refund-${tip.receipt_id}-${Math.round(owed * 100)}`;
    const { stripe } = await import("@/lib/stripe/server");

    // Refresh the initiated timestamp (extends the withdrawal protection window)
    await supabaseAdmin
      .from("tip_intents")
      .update({ refund_initiated_at: new Date().toISOString() })
      .eq("receipt_id", tip.receipt_id);

    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: tip.stripe_payment_intent_id,
          amount: Math.round(owed * 100),
          metadata: {
            tip_intent_id: tip.receipt_id,
            admin_id: adminId,
            retry: "true",
            initiated_at: new Date().toISOString(),
          },
        },
        { idempotencyKey }
      );
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e ?? "Stripe refund retry failed");
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "refund_retry",
      target_user: tip.creator_user_id,
      metadata: { tip_intent_id: tip.receipt_id, amount: owed, refund_id: stripeRefund.id },
      severity: "warning",
    });

    return NextResponse.json({
      ok: true,
      refund_id: stripeRefund.id,
      amount: owed,
      status: stripeRefund.status,
      retried: true,
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
