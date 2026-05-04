import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { logDisputeEvent } from "@/lib/disputeEvents";

export const runtime = "nodejs";

/**
 * Multi-tier dispute approval:
 *  - finance_admin proposes → needs super_admin or owner to finalize
 *  - super_admin proposes → needs another super_admin or owner to finalize
 *  - owner finalizes anything instantly (no second approval)
 *  - 2 super_admins = approved (no owner needed)
 *  - note is mandatory
 */

type ApprovalRow = {
  id: string;
  receipt_id: string;
  action: string;
  note: string;
  proposed_by: string;
  proposed_by_role: string;
  status: string;
  approved_by?: string | null;
};

function canFinalize(proposerRole: string, approverRole: string): boolean {
  // Owner can finalize anything
  if (approverRole === "owner") return true;
  // Super admin can finalize finance_admin or another super_admin's proposal
  if (approverRole === "super_admin" && (proposerRole === "finance_admin" || proposerRole === "super_admin")) return true;
  return false;
}

// Execute the actual Stripe + DB resolution
async function executeResolution(
  receiptId: string,
  action: string,
  note: string,
  tipCreatorUserId: string,
  stripePaymentIntentId: string | null,
  finalAdminId: string,
) {
  let stripeDispute: { id: string; status: string } | null = null;
  if (stripePaymentIntentId) {
    try {
      const disputes = await stripe.disputes.list({ payment_intent: stripePaymentIntentId, limit: 1 });
      if (disputes.data.length > 0) {
        stripeDispute = { id: disputes.data[0].id, status: disputes.data[0].status };
      }
    } catch (e) {
      console.error("[resolve-dispute] Failed to fetch Stripe dispute:", e instanceof Error ? e.message : e);
    }
  }

  if (action === "accept") {
    if (stripeDispute && stripeDispute.status === "needs_response") {
      try { await stripe.disputes.close(stripeDispute.id); } catch (e) {
        console.error("[resolve-dispute] Stripe close failed:", e instanceof Error ? e.message : e);
      }
    }
    await supabaseAdmin.from("tip_intents")
      .update({ status: "dispute_resolved", refund_status: "full" })
      .eq("receipt_id", receiptId);
  } else if (action === "counter") {
    if (stripeDispute && stripeDispute.status === "needs_response") {
      try {
        await stripe.disputes.update(stripeDispute.id, {
          evidence: {
            uncategorized_text: note || "This was a voluntary tip made by the cardholder on 1neLink. No goods or services were exchanged.",
            product_description: "Voluntary tip/donation on 1neLink tipping platform",
          },
          submit: true,
        });
      } catch (e) {
        console.error("[resolve-dispute] Stripe counter failed:", e instanceof Error ? e.message : e);
        throw new Error("Failed to submit evidence to Stripe");
      }
    }
    await supabaseAdmin.from("tip_intents")
      .update({ status: "dispute_countered" })
      .eq("receipt_id", receiptId);
  }

  // If accepted, check if creator should be unrestricted
  if (action === "accept") {
    const { count } = await supabaseAdmin.from("tip_intents")
      .select("receipt_id", { count: "exact", head: true })
      .eq("creator_user_id", tipCreatorUserId)
      .eq("status", "disputed");

    if ((count ?? 0) === 0) {
      const { data: profile } = await supabaseAdmin.from("profiles")
        .select("account_status, status_reason")
        .eq("user_id", tipCreatorUserId)
        .maybeSingle();

      if (profile?.account_status === "restricted" && profile.status_reason?.startsWith("chargeback_dispute_")) {
        await supabaseAdmin.from("profiles")
          .update({ account_status: "active", status_reason: null })
          .eq("user_id", tipCreatorUserId);
      }
    }
  }

  return stripeDispute;
}

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "refund"); // finance_admin, super_admin, owner

    const { receipt_id, action, note, approval_id } = await req.json();

    // ── Mandatory note check ──
    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return NextResponse.json({ error: "Internal note is mandatory" }, { status: 400 });
    }

    // ── STEP 2: Finalizing an existing approval ──
    if (approval_id) {
      const { data: approval, error: apErr } = await supabaseAdmin
        .from("dispute_approvals")
        .select("*")
        .eq("id", approval_id)
        .eq("status", "pending")
        .maybeSingle() as { data: ApprovalRow | null; error: any };

      if (apErr) return NextResponse.json({ error: apErr.message }, { status: 500 });
      if (!approval) return NextResponse.json({ error: "Approval not found or already resolved" }, { status: 404 });

      // Can't approve your own proposal
      if (approval.proposed_by === session.userId) {
        return NextResponse.json({ error: "Cannot approve your own proposal" }, { status: 403 });
      }

      // Check if this admin's role can finalize the proposer's role
      if (!canFinalize(approval.proposed_by_role, session.role)) {
        return NextResponse.json({
          error: session.role === "finance_admin"
            ? "Finance admins cannot finalize approvals. A super admin or owner must approve."
            : "Insufficient role to finalize this approval",
        }, { status: 403 });
      }

        // Claim this pending approval atomically to prevent concurrent double-finalization.
        const { data: claimedApproval, error: claimErr } = await supabaseAdmin
          .from("dispute_approvals")
          .update({
            approved_by: session.userId,
            approved_by_role: session.role,
            approved_at: new Date().toISOString(),
          })
          .eq("id", approval_id)
          .eq("status", "pending")
          .is("approved_by", null)
          .select("id")
          .maybeSingle();

        if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
        if (!claimedApproval) {
          return NextResponse.json({ error: "Approval is already being processed or completed" }, { status: 409 });
        }

      // Load the tip
      const { data: tip } = await supabaseAdmin.from("tip_intents")
        .select("receipt_id, creator_user_id, tip_amount, stripe_payment_intent_id, status")
        .eq("receipt_id", approval.receipt_id)
        .maybeSingle();

      if (!tip || tip.status !== "disputed") {
        await supabaseAdmin.from("dispute_approvals")
          .update({ status: "rejected", reject_note: "Tip no longer disputed" })
          .eq("id", approval_id);
        return NextResponse.json({ error: "Tip is no longer in disputed status" }, { status: 400 });
      }

      // Execute the resolution
      let stripeDispute;
      try {
        stripeDispute = await executeResolution(
          approval.receipt_id, approval.action, approval.note,
          tip.creator_user_id, tip.stripe_payment_intent_id, session.userId,
        );
      } catch (e) {
          // Release claim so another approver can retry after transient failures.
          await supabaseAdmin.from("dispute_approvals")
            .update({ approved_by: null, approved_by_role: null, approved_at: null })
            .eq("id", approval_id)
            .eq("status", "pending")
            .eq("approved_by", session.userId);
        return NextResponse.json({ error: e instanceof Error ? e.message : "Execution failed" }, { status: 500 });
      }

      // Mark approval as approved
        const { error: markApprovedErr } = await supabaseAdmin.from("dispute_approvals")
        .update({
          status: "approved",
        })
          .eq("id", approval_id)
          .eq("status", "pending")
          .eq("approved_by", session.userId);

        if (markApprovedErr) {
          return NextResponse.json({ error: markApprovedErr.message }, { status: 500 });
        }

      // Log both admin actions
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: session.userId,
        action: approval.action === "accept" ? "dispute_accepted" : "dispute_countered",
        target_user: tip.creator_user_id,
        severity: "warning",
        metadata: {
          receipt_id: approval.receipt_id,
          tip_amount: tip.tip_amount,
          stripe_dispute_id: stripeDispute?.id ?? null,
          approval_id,
          proposed_by: approval.proposed_by,
          proposed_by_role: approval.proposed_by_role,
          approver_note: note.trim(),
          proposer_note: approval.note,
        },
      });

      // Targeted alert: dispute resolved
      try {
        const { sendDisputeAlert, getAssignedAdmin } = await import("@/lib/disputeAlerts");
        const assignedAdmin = await getAssignedAdmin(supabaseAdmin, approval.receipt_id);
        await sendDisputeAlert(supabaseAdmin, {
          receipt_id: approval.receipt_id,
          amount: Number(tip.tip_amount),
          creator_id: tip.creator_user_id,
          severity: "medium",
          event: approval.action === "accept" ? "dispute_resolved" : "dispute_countered",
        }, assignedAdmin);
      } catch (_e) {
        console.error("[dispute-alert] Failed to send resolution alert:", _e);
      }

      // Timeline event: approval finalized
      await logDisputeEvent(
        supabaseAdmin, approval.receipt_id, "approval",
        `Approved ${approval.action === "accept" ? "accept loss" : "counter dispute"} (proposed by ${approval.proposed_by_role.replace("_", " ")})`,
        session.userId,
        { approval_id, action: approval.action, proposer_role: approval.proposed_by_role, approver_note: note.trim() },
      );

      return NextResponse.json({
        success: true,
        step: "finalized",
        action: approval.action,
        receipt_id: approval.receipt_id,
        stripe_dispute_id: stripeDispute?.id ?? null,
      });
    }

    // ── STEP 1: Proposing a new resolution (or instant if owner) ──
    if (!receipt_id || !action) {
      return NextResponse.json({ error: "receipt_id and action required" }, { status: 400 });
    }
    if (!["accept", "counter"].includes(action)) {
      return NextResponse.json({ error: "action must be 'accept' or 'counter'" }, { status: 400 });
    }

    // Check for existing pending approval on this receipt
    const { data: existingApproval } = await supabaseAdmin
      .from("dispute_approvals")
      .select("id")
      .eq("receipt_id", receipt_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingApproval) {
      return NextResponse.json({ error: "A pending approval already exists for this dispute" }, { status: 409 });
    }

    // Load the tip
    const { data: tip, error: tipErr } = await supabaseAdmin.from("tip_intents")
      .select("receipt_id, creator_user_id, tip_amount, stripe_payment_intent_id, status")
      .eq("receipt_id", receipt_id)
      .maybeSingle();

    if (tipErr) return NextResponse.json({ error: tipErr.message }, { status: 500 });
    if (!tip) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    if (tip.status !== "disputed") {
      return NextResponse.json({ error: "Tip is not in disputed status" }, { status: 400 });
    }

    // ── Owner: instant approval (no second step) ──
    if (session.role === "owner") {
      let stripeDispute;
      try {
        stripeDispute = await executeResolution(
          receipt_id, action, note.trim(),
          tip.creator_user_id, tip.stripe_payment_intent_id, session.userId,
        );
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Execution failed" }, { status: 500 });
      }

      // Record as instant approval
      await supabaseAdmin.from("dispute_approvals").insert({
        receipt_id,
        action,
        note: note.trim(),
        proposed_by: session.userId,
        proposed_by_role: session.role,
        approved_by: session.userId,
        approved_by_role: session.role,
        approved_at: new Date().toISOString(),
        status: "approved",
      });

      await supabaseAdmin.from("admin_actions").insert({
        admin_id: session.userId,
        action: action === "accept" ? "dispute_accepted" : "dispute_countered",
        target_user: tip.creator_user_id,
        severity: "warning",
        metadata: {
          receipt_id,
          tip_amount: tip.tip_amount,
          stripe_dispute_id: stripeDispute?.id ?? null,
          instant_owner_approval: true,
          note: note.trim(),
        },
      });

      // Targeted alert: owner instant resolution
      try {
        const { sendDisputeAlert, getAssignedAdmin } = await import("@/lib/disputeAlerts");
        const assignedAdmin = await getAssignedAdmin(supabaseAdmin, receipt_id);
        await sendDisputeAlert(supabaseAdmin, {
          receipt_id,
          amount: Number(tip.tip_amount),
          creator_id: tip.creator_user_id,
          severity: "medium",
          event: action === "accept" ? "dispute_resolved" : "dispute_countered",
        }, assignedAdmin);
      } catch (_e) {
        console.error("[dispute-alert] Failed to send resolution alert:", _e);
      }

      // Timeline event: owner instant resolution
      await logDisputeEvent(
        supabaseAdmin, receipt_id,
        "status_change",
        `Dispute ${action === "accept" ? "accepted (loss)" : "countered"} — instant owner approval`,
        session.userId,
        { action, note: note.trim(), instant: true },
      );

      return NextResponse.json({
        success: true,
        step: "finalized",
        action,
        receipt_id,
        stripe_dispute_id: stripeDispute?.id ?? null,
      });
    }

    // ── Finance admin or super admin: create pending approval ──
    const { data: approval, error: insertErr } = await supabaseAdmin
      .from("dispute_approvals")
      .insert({
        receipt_id,
        action,
        note: note.trim(),
        proposed_by: session.userId,
        proposed_by_role: session.role,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Log the proposal
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: action === "accept" ? "dispute_accept_proposed" : "dispute_counter_proposed",
      target_user: tip.creator_user_id,
      severity: "info",
      metadata: { receipt_id, tip_amount: tip.tip_amount, approval_id: approval.id, note: note.trim() },
    });

    // Targeted alert: approval needed from higher-role admins
    try {
      const { sendDisputeAlert, getAssignedAdmin } = await import("@/lib/disputeAlerts");
      const assignedAdmin = await getAssignedAdmin(supabaseAdmin, receipt_id);
      await sendDisputeAlert(supabaseAdmin, {
        receipt_id,
        amount: Number(tip.tip_amount),
        creator_id: tip.creator_user_id,
        severity: "medium",
        event: "approval_needed",
      }, assignedAdmin);
    } catch (_e) {
      console.error("[dispute-alert] Failed to send approval_needed alert:", _e);
    }

    // Timeline event: resolution proposed
    await logDisputeEvent(
      supabaseAdmin, receipt_id, "proposal",
      `Proposed to ${action === "accept" ? "accept loss" : "counter dispute"}`,
      session.userId,
      { action, approval_id: approval.id, note: note.trim() },
    );

    return NextResponse.json({
      success: true,
      step: "proposed",
      approval_id: approval.id,
      needs_approval_from: session.role === "finance_admin"
        ? "super_admin or owner"
        : "another super_admin or owner",
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

/**
 * GET: Fetch pending approvals for the disputes page
 */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "refund");

    const { data, error } = await supabaseAdmin
      .from("dispute_approvals")
      .select("*")
      .eq("status", "pending")
        .is("approved_by", null)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: "Failed to load approval history." }, { status: 500 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH: Reject a pending approval
 */
export async function PATCH(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin"]);

    const { approval_id, reject_note } = await req.json();
    if (!approval_id) return NextResponse.json({ error: "approval_id required" }, { status: 400 });

    const { data: approval } = await supabaseAdmin
      .from("dispute_approvals")
      .select("id, proposed_by, receipt_id")
      .eq("id", approval_id)
      .eq("status", "pending")
      .is("approved_by", null)
      .maybeSingle();

    if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

    await supabaseAdmin.from("dispute_approvals")
      .update({ status: "rejected", reject_note: reject_note || null, approved_by: session.userId, approved_at: new Date().toISOString() })
      .eq("id", approval_id);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
