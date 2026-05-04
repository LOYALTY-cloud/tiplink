import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(admin.role, "refund");

    const { searchParams } = new URL(req.url);
    const tipId = searchParams.get("tip_id");
    if (!tipId)
      return NextResponse.json(
        { error: "Missing tip_id" },
        { status: 400 },
      );

    // 1. Fetch the tip
    const { data: tip } = await supabaseAdmin
      .from("tip_intents")
      .select(
        "receipt_id, creator_user_id, tip_amount, refunded_amount, refund_status, refund_initiated_at, stripe_payment_intent_id, status, created_at",
      )
      .eq("receipt_id", tipId)
      .maybeSingle();

    if (!tip)
      return NextResponse.json({ error: "Tip not found" }, { status: 404 });

    // 2. Fetch admin actions related to this tip
    const { data: adminActions } = await supabaseAdmin
      .from("admin_actions")
      .select("id, admin_id, action, reason, metadata, severity, created_at")
      .or(
        `metadata->>tip_intent_id.eq.${tipId},metadata->>receipt_id.eq.${tipId}`,
      )
      .order("created_at", { ascending: true })
      .limit(50);

    // 3. Fetch risk alerts for the creator
    const { data: riskAlerts } = await supabaseAdmin
      .from("risk_alerts")
      .select("id, type, message, severity, resolved, created_at")
      .eq("user_id", tip.creator_user_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // 4. Fetch processed_refunds for this tip
    const { data: processedRefunds } = await supabaseAdmin
      .from("processed_refunds")
      .select("refund_id, processed_at")
      .eq("tip_id", tipId)
      .order("processed_at", { ascending: true });

    // 5. Fetch refund_requests that reference this tip
    const { data: refundRequests } = await supabaseAdmin
      .from("refund_requests")
      .select(
        "id, requested_by, amount, status, reason, note, required_approvals, requires_owner, created_at",
      )
      .eq("tip_intent_id", tipId)
      .order("created_at", { ascending: true });

    // 6. Fetch creator profile
    const { data: creator } = await supabaseAdmin
      .from("profiles")
      .select("handle, display_name")
      .eq("user_id", tip.creator_user_id)
      .maybeSingle();

    // 7. Fetch wallet balance
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", tip.creator_user_id)
      .maybeSingle();

    // 8. Fetch disputes linked to this creator (tip_intents with status=disputed)
    const { data: creatorDisputes } = await supabaseAdmin
      .from("tip_intents")
      .select(
        "receipt_id, tip_amount, refunded_amount, refund_status, status, created_at, stripe_payment_intent_id",
      )
      .eq("creator_user_id", tip.creator_user_id)
      .eq("status", "disputed")
      .order("created_at", { ascending: false })
      .limit(20);

    // 9. Fetch dispute events for the current tip (if disputed)
    const { data: disputeEvents } = await supabaseAdmin
      .from("dispute_events")
      .select("id, admin_id, type, message, created_at")
      .eq("dispute_id", tipId)
      .order("created_at", { ascending: true })
      .limit(30);

    // 10. Build unified timeline
    const timeline: Array<{
      type: string;
      title: string;
      detail: string | null;
      actor: string | null;
      severity: string;
      created_at: string;
    }> = [];

    // Tip creation
    timeline.push({
      type: "tip_created",
      title: "Tip created",
      detail: `$${Number(tip.tip_amount).toFixed(2)} received`,
      actor: null,
      severity: "info",
      created_at: tip.created_at,
    });

    // Admin actions
    for (const a of adminActions ?? []) {
      timeline.push({
        type: "admin_action",
        title: formatAction(a.action),
        detail: a.reason ?? (a.metadata as Record<string, unknown>)?.note as string ?? null,
        actor: a.admin_id,
        severity: a.severity ?? "info",
        created_at: a.created_at,
      });
    }

    // Processed refunds (Stripe completions)
    for (const pr of processedRefunds ?? []) {
      timeline.push({
        type: "stripe_refund",
        title: "Stripe refund processed",
        detail: pr.refund_id,
        actor: null,
        severity: "info",
        created_at: pr.processed_at,
      });
    }

    // Refund requests
    for (const rr of refundRequests ?? []) {
      timeline.push({
        type: "refund_request",
        title: `Approval request (${rr.status})`,
        detail: rr.reason ?? rr.note ?? null,
        actor: rr.requested_by,
        severity: rr.status === "pending" ? "warning" : "info",
        created_at: rr.created_at,
      });
    }

    // Refund initiated
    if (tip.refund_initiated_at) {
      timeline.push({
        type: "refund_initiated",
        title: "Refund initiated",
        detail: null,
        actor: null,
        severity: "warning",
        created_at: tip.refund_initiated_at,
      });
    }

    // Dispute events
    for (const de of disputeEvents ?? []) {
      timeline.push({
        type: "dispute_event",
        title: `Dispute: ${de.type.replace(/_/g, " ")}`,
        detail: de.message ?? null,
        actor: de.admin_id ?? null,
        severity: "critical",
        created_at: de.created_at,
      });
    }

    // Sort by time
    timeline.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    // Resolve actor handles
    const actorIds = [
      ...new Set(timeline.map((e) => e.actor).filter(Boolean) as string[]),
    ];
    const actorMap: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle")
        .in("user_id", actorIds);
      for (const p of profiles ?? []) {
        if (p.handle) actorMap[p.user_id] = p.handle;
      }
    }

    return NextResponse.json({
      tip,
      creator: creator ?? null,
      balance: Number(wallet?.balance ?? 0),
      timeline,
      actorMap,
      riskAlerts: riskAlerts ?? [],
      refundRequests: refundRequests ?? [],
      processedRefunds: processedRefunds ?? [],
      creatorDisputes: creatorDisputes ?? [],
      creatorDisputeCount: creatorDisputes?.length ?? 0,
      thisIpDisputed: tip.status === "disputed",
    });
  } catch (err) {
    console.error("[admin/refund/detail] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function formatAction(action: string): string {
  switch (action) {
    case "refund":
      return "Refund executed";
    case "refund_request":
      return "Refund request created";
    case "refund_retry":
      return "Refund retry attempted";
    case "refund_mismatch_block":
      return "Refund blocked (PI mismatch)";
    default:
      return action.replace(/_/g, " ");
  }
}
