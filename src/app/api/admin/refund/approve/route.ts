import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { createRiskAlert } from "@/lib/riskAlerts";

export const runtime = "nodejs";

/** POST — approve a pending refund request */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "refund");
    const adminId = session.userId;
    const adminRole = session.role;

    const { refund_id } = await req.json();
    if (!refund_id) return NextResponse.json({ error: "Missing refund_id" }, { status: 400 });

    // Load the refund request
    const { data: refund, error: refundErr } = await supabaseAdmin
      .from("refund_requests")
      .select("*")
      .eq("id", refund_id)
      .single();

    if (refundErr || !refund) return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
    if (refund.status !== "pending") return NextResponse.json({ error: `Request already ${refund.status}` }, { status: 400 });

    // Can't approve your own request
    if (refund.requested_by === adminId) {
      return NextResponse.json({ error: "Cannot approve your own refund request" }, { status: 403 });
    }

    // Check if admin already voted
    const { data: existingVote } = await supabaseAdmin
      .from("refund_approval_votes")
      .select("id")
      .eq("refund_id", refund_id)
      .eq("admin_id", adminId)
      .maybeSingle();

    if (existingVote) return NextResponse.json({ error: "You already approved this request" }, { status: 409 });

    // Insert vote
    const { error: voteErr } = await supabaseAdmin
      .from("refund_approval_votes")
      .insert({ refund_id, admin_id: adminId });

    if (voteErr) return NextResponse.json({ error: voteErr.message }, { status: 500 });

    // Count total votes
    const { count } = await supabaseAdmin
      .from("refund_approval_votes")
      .select("id", { count: "exact", head: true })
      .eq("refund_id", refund_id);

    const voteCount = count ?? 0;

    // Log approval vote
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "refund_approve",
      target_user: null,
      metadata: {
        refund_request_id: refund_id,
        tip_intent_id: refund.tip_intent_id,
        amount: refund.amount,
        vote_number: voteCount,
        required: refund.required_approvals,
      },
      severity: "info",
    });

    // Check if we have enough approvals
    if (voteCount < refund.required_approvals) {
      return NextResponse.json({
        ok: true,
        executed: false,
        votes: voteCount,
        required: refund.required_approvals,
        message: `Approval recorded (${voteCount}/${refund.required_approvals})`,
      });
    }

    // If owner approval is required, verify an owner has voted
    if (refund.requires_owner) {
      const { data: votes } = await supabaseAdmin
        .from("refund_approval_votes")
        .select("admin_id")
        .eq("refund_id", refund_id);

      // Look up roles for all voters
      const voterIds = (votes ?? []).map((v: any) => v.admin_id);
      const { data: voterProfiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, role")
        .in("user_id", voterIds);

      const hasOwnerVote = (voterProfiles ?? []).some((p: any) => p.role === "owner");
      if (!hasOwnerVote) {
        return NextResponse.json({
          ok: true,
          executed: false,
          votes: voteCount,
          required: refund.required_approvals,
          message: `${voteCount}/${refund.required_approvals} approvals met, but owner approval still required`,
          needs_owner: true,
        });
      }
    }

    // ── All approvals met — execute the refund ──

    // Per-admin rate limit: max 3 refund executions per minute
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentExecCount } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminId)
      .eq("action", "refund")
      .gte("created_at", oneMinuteAgo);
    if ((recentExecCount ?? 0) >= 3) {
      return NextResponse.json({ error: "Rate limit exceeded: max 3 refund executions per minute" }, { status: 429 });
    }

    // In-flight lock: prevent two admins from executing the same approved refund simultaneously
    const { data: lockResult, error: lockErr } = await supabaseAdmin
      .from("refund_requests")
      .update({ locked_at: new Date().toISOString(), locked_by: adminId })
      .eq("id", refund_id)
      .is("locked_at", null)
      .select("id")
      .maybeSingle();

    if (!lockResult) {
      return NextResponse.json({ error: "Refund request is already being executed by another admin" }, { status: 409 });
    }

    // Load the tip
    const { data: tip } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id, stripe_payment_intent_id, tip_amount, refunded_amount, refund_status, creator_user_id")
      .eq("receipt_id", refund.tip_intent_id)
      .single();

    if (!tip) {
      await supabaseAdmin.from("refund_requests").update({ status: "rejected" }).eq("id", refund_id);
      return NextResponse.json({ error: "Tip not found — request rejected" }, { status: 404 });
    }

    if (tip.refund_status === "full") {
      await supabaseAdmin.from("refund_requests").update({ status: "rejected" }).eq("id", refund_id);
      return NextResponse.json({ error: "Tip already fully refunded" }, { status: 400 });
    }

    if (tip.refund_status === "initiated") {
      return NextResponse.json({ error: "Refund already in progress — wait for webhook" }, { status: 409 });
    }

    const refundAmt = Number(refund.amount);

    // Partial refund guard: re-verify against current refunded_amount
    const tipAmount = Number(tip.tip_amount ?? 0);
    const alreadyRefunded = Number(tip.refunded_amount ?? 0);
    const maxRefundable = Number((tipAmount - alreadyRefunded).toFixed(2));
    if (refundAmt > maxRefundable) {
      await supabaseAdmin.from("refund_requests").update({ status: "rejected" }).eq("id", refund_id);
      return NextResponse.json(
        { error: `Refund amount $${refundAmt.toFixed(2)} exceeds current refundable balance of $${maxRefundable.toFixed(2)}` },
        { status: 400 }
      );
    }

    // Identity lock: verify PaymentIntent destination matches creator's connected account
    const { stripe } = await import("@/lib/stripe/server");
    const { data: creatorProfile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", tip.creator_user_id)
      .maybeSingle();

    if (!creatorProfile?.stripe_account_id) {
      await supabaseAdmin.from("refund_requests").update({ status: "rejected" }).eq("id", refund_id);
      return NextResponse.json({ error: "Creator has no connected Stripe account" }, { status: 400 });
    }

    const pi = await stripe.paymentIntents.retrieve(tip.stripe_payment_intent_id);
    const piDestination = typeof pi.transfer_data?.destination === "string"
      ? pi.transfer_data.destination
      : (pi.transfer_data?.destination as any)?.id ?? null;

    if (piDestination !== creatorProfile.stripe_account_id) {
      console.error(
        `[ALERT] Refund destination mismatch for tip ${tip.receipt_id}: PI destination=${piDestination}, creator account=${creatorProfile.stripe_account_id}`
      );
      await createRiskAlert({
        user_id: tip.creator_user_id,
        type: "payment_mismatch",
        message: `Refund blocked (approved): PI ${tip.stripe_payment_intent_id} destination ${piDestination} != creator account ${creatorProfile.stripe_account_id}`,
        severity: "critical",
      });
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: adminId,
        action: "refund_mismatch_block",
        target_user: tip.creator_user_id,
        metadata: {
          tip_intent_id: tip.receipt_id,
          pi_id: tip.stripe_payment_intent_id,
          pi_destination: piDestination,
          expected_account: creatorProfile.stripe_account_id,
          expected_cents: Math.round(tipAmount * 100),
          received_cents: pi.amount_received,
          requested_refund_cents: Math.round(refundAmt * 100),
          creator_account: creatorProfile.stripe_account_id,
          refund_request_id: refund_id,
        },
        severity: "critical",
      });
      await supabaseAdmin.from("refund_requests").update({ status: "rejected" }).eq("id", refund_id);
      return NextResponse.json(
        { error: "Payment destination mismatch — refusing refund to prevent funds routing error" },
        { status: 409 }
      );
    }

    // Stripe source-of-truth: verify amount_received matches expected total (cents invariant)
    const toCents = (v: number) => Math.round(v * 100);
    const piReceivedCents = pi.amount_received;
    const tipAmountCents = toCents(tipAmount);
    if (piReceivedCents < tipAmountCents) {
      console.error(
        `[ALERT] Stripe amount mismatch for tip ${tip.receipt_id}: PI received=${piReceivedCents}¢, expected>=${tipAmountCents}¢`
      );
      await supabaseAdmin.from("refund_requests").update({ status: "rejected", locked_at: null, locked_by: null }).eq("id", refund_id);
      return NextResponse.json(
        { error: `Stripe amount mismatch: received ${piReceivedCents}¢ but tip was ${tipAmountCents}¢` },
        { status: 409 }
      );
    }

    // Stripe refundable remaining: guard against over-refunding vs Stripe reality
    const stripeRefundableCents = pi.amount_received - ((pi as any).charges?.data?.[0]?.amount_refunded ?? 0);
    const requestedCents = toCents(refundAmt);
    if (requestedCents > stripeRefundableCents) {
      console.error(
        `[ALERT] Refund exceeds Stripe remaining for tip ${tip.receipt_id}: requested=${requestedCents}¢, remaining=${stripeRefundableCents}¢`
      );
      await supabaseAdmin.from("refund_requests").update({ status: "rejected", locked_at: null, locked_by: null }).eq("id", refund_id);
      return NextResponse.json(
        { error: `Refund ${requestedCents}¢ exceeds Stripe refundable remaining ${stripeRefundableCents}¢` },
        { status: 409 }
      );
    }

    // Check creator balance
    const { data: walletRow } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", tip.creator_user_id)
      .maybeSingle();

    const creatorBalance = Number(walletRow?.balance ?? 0);
    if (refundAmt > creatorBalance) {
      return NextResponse.json({
        error: `Insufficient creator balance ($${creatorBalance.toFixed(2)}) to cover refund of $${refundAmt.toFixed(2)}`,
      }, { status: 409 });
    }

    // Mark tip as initiated
    await supabaseAdmin
      .from("tip_intents")
      .update({ refund_status: "initiated", refund_initiated_at: new Date().toISOString() })
      .eq("receipt_id", tip.receipt_id);

    // Execute Stripe refund (scoped idempotency key: request_id + amount)
    const idempotencyKey = `refund-${refund_id}-${Math.round(refundAmt * 100)}-approved`;
    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: tip.stripe_payment_intent_id,
          amount: Math.round(refundAmt * 100),
          reverse_transfer: true,
          refund_application_fee: true,
          metadata: {
            tip_intent_id: tip.receipt_id,
            refund_request_id: refund_id,
          },
        },
        { idempotencyKey }
      );
    } catch (e: unknown) {
      // Roll back tip status and release in-flight lock
      const alreadyRefunded = Number(tip.refunded_amount ?? 0);
      await supabaseAdmin
        .from("tip_intents")
        .update({ refund_status: alreadyRefunded > 0 ? "partial" : "none" })
        .eq("receipt_id", tip.receipt_id);
      await supabaseAdmin
        .from("refund_requests")
        .update({ locked_at: null, locked_by: null })
        .eq("id", refund_id);
      const errMsg = e instanceof Error ? e.message : String(e ?? "Stripe refund failed");
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    // Mark request as approved (release in-flight lock)
    await supabaseAdmin
      .from("refund_requests")
      .update({ status: "approved", locked_at: null, locked_by: null })
      .eq("id", refund_id);

    // Log execution
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: adminId,
      action: "refund",
      target_user: tip.creator_user_id,
      metadata: {
        tip_intent_id: tip.receipt_id,
        amount: refundAmt,
        refund_id: stripeRefund.id,
        refund_request_id: refund_id,
        approved_via: "multi_approval",
      },
      severity: "danger",
    });

    return NextResponse.json({
      ok: true,
      executed: true,
      refund_id: stripeRefund.id,
      amount: refundAmt,
      message: "Refund approved and executed",
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
