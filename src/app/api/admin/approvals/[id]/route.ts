import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // 1. Fetch the refund request
    const { data: refund, error: refundErr } = await supabaseAdmin
      .from("refund_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (refundErr || !refund) {
      return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
    }

    // 2. Fetch the linked tip intent
    let tip: Record<string, unknown> | null = null;
    if (refund.tip_intent_id) {
      const { data } = await supabaseAdmin
        .from("tip_intents")
        .select(
          "receipt_id, stripe_payment_intent_id, creator_user_id, supporter_name, supporter_user_id, tip_amount, stripe_fee, platform_fee, total_charge, note, message, is_anonymous, status, needs_refund, failure_reason, refund_status, refunded_amount, last_refund_id, refund_initiated_at, created_at"
        )
        .eq("receipt_id", refund.tip_intent_id)
        .maybeSingle();
      tip = data;
    }

    // 3. Fetch all votes with voter profiles
    const { data: votesRaw } = await supabaseAdmin
      .from("refund_approval_votes")
      .select("id, admin_id, created_at")
      .eq("refund_id", id)
      .order("created_at", { ascending: true });

    const votes = votesRaw ?? [];
    const voterIds = votes.map((v) => v.admin_id);

    const voterProfiles: Record<string, { handle: string | null; role: string | null; display_name: string | null }> = {};
    if (voterIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle, role, display_name")
        .in("user_id", voterIds);
      for (const p of profiles ?? []) {
        voterProfiles[p.user_id] = { handle: p.handle, role: p.role, display_name: p.display_name };
      }
    }

    const voteTimeline = votes.map((v) => ({
      admin_id: v.admin_id,
      handle: voterProfiles[v.admin_id]?.handle ?? null,
      role: voterProfiles[v.admin_id]?.role ?? null,
      display_name: voterProfiles[v.admin_id]?.display_name ?? null,
      voted_at: v.created_at,
    }));

    // 4. Fetch requester profile
    let requester: { handle: string | null; display_name: string | null; role: string | null } | null = null;
    if (refund.requested_by) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("handle, display_name, role")
        .eq("user_id", refund.requested_by)
        .maybeSingle();
      requester = data;
    }

    // 5. Fetch creator profile (tip recipient)
    let creator: { handle: string | null; display_name: string | null } | null = null;
    if (tip?.creator_user_id) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("handle, display_name")
        .eq("user_id", tip.creator_user_id as string)
        .maybeSingle();
      creator = data;
    }

    // 6. Fetch audit trail (admin_actions related to this refund)
    const { data: actionsRaw } = await supabaseAdmin
      .from("admin_actions")
      .select("id, admin_id, action, reason, metadata, severity, created_at")
      .or(`metadata->>refund_request_id.eq.${id},metadata->>tip_intent_id.eq.${refund.tip_intent_id}`)
      .order("created_at", { ascending: true })
      .limit(50);

    const actions = actionsRaw ?? [];

    // 7. Fetch risk alerts for the tip creator
    let riskAlerts: { id: string; type: string; message: string; severity: string; resolved: boolean; created_at: string }[] = [];
    if (tip?.creator_user_id) {
      const { data } = await supabaseAdmin
        .from("risk_alerts")
        .select("id, type, message, severity, resolved, created_at")
        .eq("user_id", tip.creator_user_id as string)
        .order("created_at", { ascending: false })
        .limit(10);
      riskAlerts = data ?? [];
    }

    // Attach computed fields so the refund shape matches the client type
    const enrichedRefund = {
      ...refund,
      votes: voteTimeline.length,
      voteDetails: voteTimeline.map((v) => ({
        admin_id: v.admin_id,
        handle: v.handle,
        role: v.role,
      })),
    };

    // Normalize tip field name to match client type
    const normalizedTip = tip
      ? {
          ...tip,
          payment_intent_id: (tip as Record<string, unknown>).stripe_payment_intent_id ?? null,
        }
      : null;

    return NextResponse.json({
      refund: enrichedRefund,
      tip: normalizedTip,
      voteTimeline,
      requester,
      creator,
      auditTrail: actions,
      riskAlerts,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
