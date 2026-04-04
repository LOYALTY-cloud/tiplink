import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/[userId]/health
 * Returns a compact user health card: ticket stats, risk level, last activity.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  // Parallel fetches
  const [ticketsRes, historyRes, profileRes, disputeRes] = await Promise.all([
    supabaseAdmin
      .from("support_tickets")
      .select("id, status, category, priority, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("user_support_history")
      .select("issue_type, outcome, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("profiles")
      .select("is_flagged, account_status, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("tip_intents")
      .select("receipt_id", { count: "exact", head: true })
      .eq("creator_user_id", userId)
      .eq("status", "disputed"),
  ]);

  const tickets = ticketsRes.data ?? [];
  const history = historyRes.data ?? [];
  const profile = profileRes.data;
  const disputeCount = disputeRes.count ?? 0;

  const totalTickets = tickets.length;
  const resolvedCount = history.filter((h) => h.outcome === "resolved").length;
  const unresolvedCount = history.filter((h) => h.outcome === "unresolved").length;
  const resolutionRate = totalTickets > 0
    ? Math.round((resolvedCount / Math.max(resolvedCount + unresolvedCount, 1)) * 100)
    : 0;

  // Last issue type
  const lastIssue = history.length > 0 ? history[0].issue_type : null;

  // Last activity (most recent ticket)
  const lastTicketAt = tickets.length > 0 ? tickets[0].created_at : null;

  // Risk level
  let riskLevel: "low" | "medium" | "high" = "low";
  if (disputeCount >= 3 || profile?.is_flagged) riskLevel = "high";
  else if (disputeCount >= 1 || unresolvedCount >= 2) riskLevel = "medium";

  // Frequent categories
  const catCounts: Record<string, number> = {};
  for (const t of tickets) {
    catCounts[t.category] = (catCounts[t.category] || 0) + 1;
  }
  const topCategory = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return NextResponse.json({
    health: {
      totalTickets,
      resolvedCount,
      unresolvedCount,
      resolutionRate,
      lastIssue,
      lastTicketAt,
      riskLevel,
      topCategory,
      disputeCount,
      accountStatus: profile?.account_status ?? "active",
      isFlagged: !!profile?.is_flagged,
    },
  });
}
