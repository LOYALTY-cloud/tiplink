import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Fetch pending requests
    const { data: pendingData } = await supabaseAdmin
      .from("refund_requests")
      .select("id, tip_intent_id, requested_by, amount, status, required_approvals, requires_owner, reason, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Fetch completed requests (approved + rejected, last 50)
    const { data: completedData } = await supabaseAdmin
      .from("refund_requests")
      .select("id, tip_intent_id, requested_by, amount, status, required_approvals, requires_owner, reason, note, created_at")
      .in("status", ["approved", "rejected"])
      .order("created_at", { ascending: false })
      .limit(50);

    const allRequests = [...(pendingData ?? []), ...(completedData ?? [])];
    const pendingIds = (pendingData ?? []).map((r) => r.id);

    // Get vote details for pending requests (no FK join — separate lookups)
    type VoteRow = { refund_id: string; admin_id: string };
    const votesByRefund: Record<string, { admin_id: string; handle: string | null; role: string | null }[]> = {};

    if (pendingIds.length > 0) {
      const { data: votesData } = await supabaseAdmin
        .from("refund_approval_votes")
        .select("refund_id, admin_id")
        .in("refund_id", pendingIds);

      const votes = (votesData ?? []) as VoteRow[];

      // Batch-fetch voter profiles
      const voterIds = [...new Set(votes.map((v) => v.admin_id))];
      const voterProfileMap: Record<string, { handle: string | null; role: string | null }> = {};

      if (voterIds.length > 0) {
        const { data: voterProfiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id, handle, role")
          .in("user_id", voterIds);
        for (const p of voterProfiles ?? []) {
          voterProfileMap[p.user_id] = { handle: p.handle, role: p.role };
        }
      }

      for (const v of votes) {
        if (!votesByRefund[v.refund_id]) votesByRefund[v.refund_id] = [];
        const prof = voterProfileMap[v.admin_id];
        votesByRefund[v.refund_id].push({
          admin_id: v.admin_id,
          handle: prof?.handle ?? null,
          role: prof?.role ?? null,
        });
      }
    }

    // Build pending with vote details
    const pending = (pendingData ?? []).map((r) => {
      const details = votesByRefund[r.id] ?? [];
      return { ...r, votes: details.length, voteDetails: details };
    });

    const completed = (completedData ?? []).map((r) => ({
      ...r,
      votes: r.required_approvals,
      voteDetails: [] as { admin_id: string; handle: string | null; role: string | null }[],
    }));

    // Batch-fetch requester profiles
    const requesterIds = [...new Set(allRequests.map((r) => r.requested_by))];
    const profileMap: Record<string, { handle: string | null; display_name: string | null }> = {};

    if (requesterIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", requesterIds);
      for (const p of profiles ?? []) {
        profileMap[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
    }

    return NextResponse.json({ pending, completed, profileMap });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
