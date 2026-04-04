import { supabaseAdmin } from "@/lib/supabase/admin";

export type AvailableAdmin = {
  user_id: string;
  display_name: string | null;
  role: string;
  availability: string;
};

// Issue type → preferred admin role mapping
const ROUTE_MAP: Record<string, string> = {
  refund: "finance_admin",
  withdrawal: "finance_admin",
  charge: "finance_admin",
  payout: "finance_admin",
  payment: "support_admin",
  account: "support_admin",
  bug: "super_admin",
  general: "support_admin",
};

// Max concurrent active sessions per admin (per-role caps)
const ROLE_CAPACITY: Record<string, number> = {
  support_admin: 8,
  finance_admin: 5,
  super_admin: 12,
  owner: 15,
};

function getMaxCapacity(role: string): number {
  return ROLE_CAPACITY[role] ?? 8;
}

/**
 * Detect the issue type from a user message using keywords.
 */
function detectIssueType(message: string): string {
  const keywords: [string, string][] = [
    ["refund", "refund"],
    ["charge", "charge"],
    ["payout", "payout"],
    ["withdraw", "withdrawal"],
    ["payment", "payment"],
    ["account", "account"],
    ["bug", "bug"],
    ["error", "bug"],
    ["crash", "bug"],
  ];
  for (const [keyword, issueType] of keywords) {
    if (message.includes(keyword)) return issueType;
  }
  return "general";
}

/**
 * Tiered fallback: find admins by role with escalation chain.
 *   1. Exact role match
 *   2. Fallback → support_admin
 *   3. Final fallback → super_admin
 *   4. Last resort → owner
 *   Returns { admins, escalatedToSuperAdmin, escalationReason }
 */
async function findBestAdminsByRole(
  issueType: string,
  fiveMinAgo: string
): Promise<{
  admins: AvailableAdmin[];
  escalatedToSuperAdmin: boolean;
  escalationReason: string | null;
}> {
  const roleNeeded = ROUTE_MAP[issueType] ?? "support_admin";

  // 1. Exact role match
  const { data: exactMatch } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, role, availability")
    .eq("role", roleNeeded)
    .in("availability", ["online", "busy"])
    .gte("last_active_at", fiveMinAgo);

  if (exactMatch && exactMatch.length > 0) {
    return { admins: exactMatch as AvailableAdmin[], escalatedToSuperAdmin: false, escalationReason: null };
  }

  // 2. Fallback → support_admin (skip if that was already the exact match)
  if (roleNeeded !== "support_admin") {
    const { data: supportFallback } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, role, availability")
      .eq("role", "support_admin")
      .in("availability", ["online", "busy"])
      .gte("last_active_at", fiveMinAgo);

    if (supportFallback && supportFallback.length > 0) {
      return {
        admins: supportFallback as AvailableAdmin[],
        escalatedToSuperAdmin: false,
        escalationReason: `no_${roleNeeded}_available`,
      };
    }
  }

  // 3. Final fallback → super_admin (skip if that was already the exact match)
  if (roleNeeded !== "super_admin") {
    const { data: superFallback } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, role, availability")
      .eq("role", "super_admin")
      .in("availability", ["online", "busy"])
      .gte("last_active_at", fiveMinAgo);

    if (superFallback && superFallback.length > 0) {
      return {
        admins: superFallback as AvailableAdmin[],
        escalatedToSuperAdmin: true,
        escalationReason: `no_${roleNeeded}_or_support_admin_available`,
      };
    }
  }

  // 4. Last resort → owner
  const { data: ownerFallback } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, role, availability")
    .eq("role", "owner")
    .in("availability", ["online", "busy"])
    .gte("last_active_at", fiveMinAgo);

  if (ownerFallback && ownerFallback.length > 0) {
    return {
      admins: ownerFallback as AvailableAdmin[],
      escalatedToSuperAdmin: true,
      escalationReason: `no_${roleNeeded}_or_support_admin_or_super_admin_available`,
    };
  }

  // 5. No admins at all → AI handles
  return { admins: [], escalatedToSuperAdmin: false, escalationReason: "no_admins_available" };
}

/**
 * Fetch the global load map: { admin_id → number of active sessions }.
 */
async function getLoadMap(): Promise<Record<string, number>> {
  const { data: activeSessions } = await supabaseAdmin
    .from("support_sessions")
    .select("assigned_admin_id")
    .eq("status", "active");

  const loadMap: Record<string, number> = {};
  for (const s of activeSessions ?? []) {
    if (s.assigned_admin_id) {
      loadMap[s.assigned_admin_id] = (loadMap[s.assigned_admin_id] || 0) + 1;
    }
  }
  return loadMap;
}

/**
 * Query performance stats from admin_performance table.
 * Returns { admin_id → score } where lower = better (avg resolution time).
 * Falls back to admin_actions if no admin_performance data.
 */
async function getPerformanceScores(issueType: string): Promise<Record<string, number>> {
  // Try the dedicated performance table first
  const { data: perfData } = await supabaseAdmin
    .from("admin_performance")
    .select("admin_id, avg_resolution_ms, success_rate, tickets_resolved")
    .eq("issue_type", issueType);

  if (perfData && perfData.length > 0) {
    const scores: Record<string, number> = {};
    for (const p of perfData) {
      if (p.tickets_resolved === 0) continue;
      // Score: lower is better. Penalize low success rate.
      const successPenalty = p.success_rate > 0 ? (100 - p.success_rate) * 1000 : 50000;
      scores[p.admin_id] = (p.avg_resolution_ms ?? 0) + successPenalty;
    }
    return scores;
  }

  // Fallback: derive from admin_actions
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: actions } = await supabaseAdmin
    .from("admin_actions")
    .select("admin_id, metadata")
    .eq("action", "support_session_closed")
    .gte("created_at", thirtyDaysAgo);

  if (!actions || actions.length === 0) return {};

  const totals: Record<string, { sum: number; count: number }> = {};
  for (const a of actions) {
    const meta = a.metadata as Record<string, unknown> | null;
    if (!meta || typeof meta.duration_ms !== "number") continue;
    if (meta.issue_type && meta.issue_type !== issueType) continue;
    const id = a.admin_id;
    if (!totals[id]) totals[id] = { sum: 0, count: 0 };
    totals[id].sum += meta.duration_ms as number;
    totals[id].count += 1;
  }

  const scores: Record<string, number> = {};
  for (const [id, { sum, count }] of Object.entries(totals)) {
    scores[id] = sum / count;
  }
  return scores;
}

/**
 * Update admin_performance stats when a ticket is resolved/closed.
 * Called from ticket PATCH handler.
 */
export async function updateAdminPerformance(
  adminId: string,
  issueType: string,
  resolutionMs: number,
  resolved: boolean,
): Promise<void> {
  // Fetch current stats
  const { data: existing } = await supabaseAdmin
    .from("admin_performance")
    .select("tickets_resolved, tickets_unresolved, avg_resolution_ms")
    .eq("admin_id", adminId)
    .eq("issue_type", issueType)
    .maybeSingle();

  if (existing) {
    const totalResolved = existing.tickets_resolved + (resolved ? 1 : 0);
    const totalUnresolved = existing.tickets_unresolved + (resolved ? 0 : 1);
    const totalTickets = totalResolved + totalUnresolved;
    const newAvg = resolved
      ? Math.round(((existing.avg_resolution_ms * existing.tickets_resolved) + resolutionMs) / totalResolved)
      : existing.avg_resolution_ms;
    const successRate = totalTickets > 0 ? Math.round((totalResolved / totalTickets) * 10000) / 100 : 0;

    await supabaseAdmin
      .from("admin_performance")
      .update({
        tickets_resolved: totalResolved,
        tickets_unresolved: totalUnresolved,
        avg_resolution_ms: newAvg,
        success_rate: successRate,
        last_updated_at: new Date().toISOString(),
      })
      .eq("admin_id", adminId)
      .eq("issue_type", issueType);
  } else {
    await supabaseAdmin
      .from("admin_performance")
      .insert({
        admin_id: adminId,
        issue_type: issueType,
        tickets_resolved: resolved ? 1 : 0,
        tickets_unresolved: resolved ? 0 : 1,
        avg_resolution_ms: resolved ? resolutionMs : 0,
        success_rate: resolved ? 100 : 0,
      });
  }
}

/**
 * Smart routing: find the best admin for a support session.
 * Uses tiered fallback: exact role → support_admin → super_admin → owner → AI.
 * Enforces per-admin capacity limits and queue backpressure.
 * Returns null if no admins are available (session stays in AI mode).
 */
export async function assignBestAdmin(
  sessionId: string,
  opts?: { priority?: number; message?: string; confidence?: number }
): Promise<AvailableAdmin | null> {
  let priority = opts?.priority ?? 0;
  const confidence = opts?.confidence ?? 0;
  const message = (opts?.message ?? "").toLowerCase();

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const loadMap = await getLoadMap();

  // Priority boost: high confidence on financial issues auto-elevates
  const issueType = detectIssueType(message);
  if (
    confidence >= 0.85 &&
    ["refund", "charge", "payout", "withdrawal"].includes(issueType)
  ) {
    priority = Math.max(priority, 3);
  }

  // Priority routing — critical (priority ≥ 3) goes directly to owner
  if (priority >= 3) {
    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, role, availability")
      .eq("role", "owner")
      .in("availability", ["online", "busy"])
      .gte("last_active_at", fiveMinAgo);

    // Filter owners who aren't at capacity (per-role limit)
    const availableOwners = (owners as AvailableAdmin[] | null)?.filter(
      (a) => (loadMap[a.user_id] || 0) < getMaxCapacity(a.role)
    );

    if (availableOwners && availableOwners.length > 0) {
      const selected = await selectAndAssign(
        sessionId,
        availableOwners,
        priority,
        message,
        issueType,
        loadMap,
        false,
        null,
      );
      return selected;
    }
    // If no owner has capacity, fall through to tiered routing
  }

  // Tiered fallback routing
  const { admins: candidates, escalatedToSuperAdmin, escalationReason } =
    await findBestAdminsByRole(issueType, fiveMinAgo);

  if (candidates.length === 0) {
    // No admins available → switch to AI mode
    await supabaseAdmin
      .from("support_sessions")
      .update({
        mode: "ai",
        escalation_reason: escalationReason,
      })
      .eq("id", sessionId);
    return null;
  }

  // Apply capacity filter — per-role limits
  const withinCapacity = candidates.filter(
    (a) => (loadMap[a.user_id] || 0) < getMaxCapacity(a.role)
  );

  // Queue backpressure: all matched admins are at capacity
  if (withinCapacity.length === 0) {
    // Keep session in "waiting" — don't force-assign overloaded admins
    await supabaseAdmin
      .from("support_sessions")
      .update({
        status: "waiting",
        mode: "ai",
        escalation_reason: "all_admins_at_capacity",
      })
      .eq("id", sessionId);

    // Insert system message so user knows
    await supabaseAdmin.from("support_messages").insert({
      session_id: sessionId,
      sender_type: "system",
      message:
        "All agents are currently at capacity. Our AI assistant will help you in the meantime — a human agent will join as soon as one is available.",
    });

    return null;
  }

  return selectAndAssign(
    sessionId,
    withinCapacity,
    priority,
    message,
    issueType,
    loadMap,
    escalatedToSuperAdmin,
    escalationReason,
  );
}

/**
 * From a list of candidates, pick the best one (online preference + load balance
 * + performance score), assign the session, notify, and update availability.
 */
async function selectAndAssign(
  sessionId: string,
  candidates: AvailableAdmin[],
  priority: number,
  message: string,
  issueType: string,
  loadMap: Record<string, number>,
  escalatedToSuperAdmin: boolean,
  escalationReason: string | null,
): Promise<AvailableAdmin | null> {
  // Prefer "online" over "busy"
  const online = candidates.filter((a) => a.availability === "online");
  let pool = online.length > 0 ? online : candidates;

  // Performance-weighted sorting: combine load + avg resolution time
  const perfScores = await getPerformanceScores(issueType);

  pool.sort((a, b) => {
    const loadA = loadMap[a.user_id] || 0;
    const loadB = loadMap[b.user_id] || 0;

    // Primary: load (fewer sessions = better)
    if (loadA !== loadB) return loadA - loadB;

    // Tiebreaker: faster avg resolution time is better
    const perfA = perfScores[a.user_id] ?? Infinity;
    const perfB = perfScores[b.user_id] ?? Infinity;
    return perfA - perfB;
  });

  const selected = pool[0];
  if (!selected) return null;

  // Assign session
  await supabaseAdmin
    .from("support_sessions")
    .update({
      assigned_admin_id: selected.user_id,
      assigned_admin_name: selected.display_name || "Admin",
      status: "active",
      ...(escalatedToSuperAdmin ? { escalated_to_super_admin: true } : {}),
      ...(escalationReason ? { escalation_reason: escalationReason } : {}),
    })
    .eq("id", sessionId);

  // Notify the admin
  await supabaseAdmin.from("support_notifications").insert({
    session_id: sessionId,
    to_admin_id: selected.user_id,
    type: escalatedToSuperAdmin ? "escalation_fallback" : "auto_assignment",
    metadata: {
      priority,
      issue_type: issueType,
      message_preview: message.slice(0, 120),
      ...(escalationReason ? { escalation_reason: escalationReason } : {}),
    },
  });

  // Auto-set busy if this was their first active session
  const adminLoad = (loadMap[selected.user_id] || 0) + 1;
  if (adminLoad >= 1 && selected.availability === "online") {
    await supabaseAdmin
      .from("profiles")
      .update({ availability: "busy" })
      .eq("user_id", selected.user_id);
  }

  return selected;
}
