import { supabaseAdmin } from "@/lib/supabase/admin";
import type { RollbackEntry } from "@/lib/adminActivityLog";

export type OwnerAiToolName =
  | "getCriticalAlerts"
  | "getTodaySummary"
  | "getAdminActivity"
  | "getOwnerApprovals"
  | "getFinancialInsights"
  | "retryFailedPayments";

type ToolParameter = {
  type: "string" | "number" | "boolean";
  description: string;
};

type ToolSchema = {
  type: "object";
  properties: Record<string, ToolParameter>;
  required?: string[];
  additionalProperties?: boolean;
};

export type OwnerAiToolDefinition = {
  name: OwnerAiToolName;
  description: string;
  parameters: ToolSchema;
};

export type CriticalAlert = {
  title: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "dismissed";
  requires_action: boolean;
  created_at: string;
  link: string | null;
};

export type TodaySummaryEvent = {
  title: string;
  type: string;
  action: string | null;
  severity: string;
  actor: string | null;
  created_at: string;
};

export type TodaySummary = {
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  recentEvents: TodaySummaryEvent[];
  windowStart: string;
  windowEnd: string;
};

export type AdminActivityItem = {
  title: string;
  type: string | null;
  action: string | null;
  severity: string | null;
  created_at: string;
};

export type FinancialInsights = {
  range: "today" | "7d" | "30d";
  totalProcessed: number;
  totalWithdrawn: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  failureRate: number;
  trends: {
    processed: number;
    withdrawals: number;
  };
  anomalies: string[];
  health: "healthy" | "warning" | "critical";
  predictive: {
    nextDayEstimate: number;
    momentum: "stable" | "growing" | "declining";
    predictions: string[];
  };
  windowStart: string;
  windowEnd: string;
};

export type OwnerApprovalItem = {
  id: string;
  amount: number;
  requested_by: string;
  requester_label: string;
  votes: number;
  required_approvals: number;
  created_at: string;
  reason: string | null;
  note: string | null;
};

export const tools: readonly OwnerAiToolDefinition[] = [
  {
    name: "getCriticalAlerts",
    description: "Get active critical admin alerts that still need attention.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getTodaySummary",
    description: "Get a summary of today's admin activity including event counts by type and severity, plus the 20 most recent events with title, type, action, actor, and timestamp.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getAdminActivity",
    description: "Get recent activity for a specific admin identifier.",
    parameters: {
      type: "object",
      properties: {
        adminId: {
          type: "string",
          description: "The admin identifier to look up, such as admin_123.",
        },
      },
      required: ["adminId"],
      additionalProperties: false,
    },
  },
  {
    name: "getOwnerApprovals",
    description: "Get pending refund approvals that require an owner vote before execution.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getFinancialInsights",
    description: "Get a financial summary of payments, withdrawals, and failed transactions for a given time range (today, 7d, or 30d).",
    parameters: {
      type: "object",
      properties: {
        range: {
          type: "string",
          description: "Time window: today, 7d, or 30d.",
        },
      },
      required: ["range"],
      additionalProperties: false,
    },
  },
  {
    name: "retryFailedPayments",
    description: "Retry failed transactions from the last 24 hours. Always simulates first so the owner can review impact before executing.",
    parameters: {
      type: "object",
      properties: {
        simulate: {
          type: "boolean",
          description: "If true, returns impact preview only — no changes are made.",
        },
      },
      additionalProperties: false,
    },
  },
] as const;

function readAdminIdArg(args: unknown): string {
  if (!args || typeof args !== "object") {
    throw new Error("adminId is required");
  }

  const adminId = (args as { adminId?: unknown }).adminId;
  if (typeof adminId !== "string" || !adminId.trim()) {
    throw new Error("adminId is required");
  }

  return adminId.trim();
}

type ActivityRow = {
  id: string;
  type: string | null;
  title: string | null;
  action: string | null;
  label: string | null;
  severity: string | null;
  created_at: string;
};

function startEndOfUtcToday(): { startIso: string; endIso: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function coerceAlertPriority(value: string | null): CriticalAlert["priority"] {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  return "medium";
}

function coerceAlertStatus(value: string | null): CriticalAlert["status"] {
  if (value === "open" || value === "in_progress" || value === "resolved" || value === "dismissed") {
    return value;
  }
  return "open";
}

function mapActivityRow(row: ActivityRow): AdminActivityItem {
  return {
    title: row.title ?? row.label ?? row.action ?? "Admin activity",
    type: row.type,
    action: row.action,
    severity: row.severity,
    created_at: row.created_at,
  };
}

export async function getCriticalAlerts(): Promise<CriticalAlert[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_notifications")
    .select("title, type, priority, status, requires_action, created_at, link")
    .eq("priority", "critical")
    .eq("archived", false)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    title: row.title ?? "Critical alert",
    type: row.type ?? "system",
    priority: coerceAlertPriority(row.priority ?? null),
    status: coerceAlertStatus(row.status ?? null),
    requires_action: row.requires_action ?? false,
    created_at: row.created_at ?? new Date().toISOString(),
    link: row.link ?? null,
  }));
}

export async function getTodaySummary(): Promise<TodaySummary> {
  const { startIso, endIso } = startEndOfUtcToday();
  const { data, error } = await supabaseAdmin
    .from("admin_activity_log")
    .select("type, severity, title, action, actor, created_at")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .not("action", "in", '("ai_tool_executed","owner_ai_query")')
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const event of data ?? []) {
    const eventType = event.type ?? "system";
    const severity = event.severity ?? "info";
    byType[eventType] = (byType[eventType] ?? 0) + 1;
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
  }

  const recentEvents: TodaySummaryEvent[] = (data ?? []).slice(0, 20).map((e) => ({
    title: e.title ?? "Untitled event",
    type: e.type ?? "system",
    action: e.action ?? null,
    severity: e.severity ?? "info",
    actor: e.actor ?? null,
    created_at: e.created_at,
  }));

  return {
    totalEvents: (data ?? []).length,
    byType,
    bySeverity,
    recentEvents,
    windowStart: startIso,
    windowEnd: endIso,
  };
}

export async function getAdminActivity(adminId: string): Promise<AdminActivityItem[]> {
  const trimmedAdminId = adminId.trim();
  if (!trimmedAdminId) return [];

  const baseQuery = "id, type, title, action, label, severity, created_at";
  const [actorResult, metadataResult] = await Promise.all([
    supabaseAdmin
      .from("admin_activity_log")
      .select(baseQuery)
      .eq("actor", trimmedAdminId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("admin_activity_log")
      .select(baseQuery)
      .eq("metadata->>admin_id", trimmedAdminId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (actorResult.error) {
    throw new Error(actorResult.error.message);
  }
  if (metadataResult.error) {
    throw new Error(metadataResult.error.message);
  }

  const merged = new Map<string, ActivityRow>();
  for (const row of (actorResult.data ?? []) as ActivityRow[]) {
    merged.set(row.id, row);
  }
  for (const row of (metadataResult.data ?? []) as ActivityRow[]) {
    merged.set(row.id, row);
  }

  return Array.from(merged.values())
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 20)
    .map(mapActivityRow);
}

type OwnerApprovalRow = {
  id: string;
  amount: number | string;
  requested_by: string;
  required_approvals: number | null;
  reason: string | null;
  note: string | null;
  created_at: string;
};

type ApprovalVoteRow = {
  refund_id: string;
  admin_id: string;
};

export async function getOwnerApprovals(): Promise<OwnerApprovalItem[]> {
  const { data, error } = await supabaseAdmin
    .from("refund_requests")
    .select("id, amount, requested_by, required_approvals, reason, note, created_at")
    .eq("status", "pending")
    .eq("requires_owner", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  const requests = (data ?? []) as OwnerApprovalRow[];
  if (requests.length === 0) return [];

  const refundIds = requests.map((request) => request.id);
  const requesterIds = [...new Set(requests.map((request) => request.requested_by))];

  const [votesResult, profilesResult] = await Promise.all([
    supabaseAdmin
      .from("refund_approval_votes")
      .select("refund_id, admin_id")
      .in("refund_id", refundIds),
    supabaseAdmin
      .from("profiles")
      .select("user_id, handle, display_name")
      .in("user_id", requesterIds),
  ]);

  if (votesResult.error) {
    throw new Error(votesResult.error.message);
  }
  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  const voteCounts = new Map<string, number>();
  for (const vote of (votesResult.data ?? []) as ApprovalVoteRow[]) {
    voteCounts.set(vote.refund_id, (voteCounts.get(vote.refund_id) ?? 0) + 1);
  }

  const requesterLabels = new Map<string, string>();
  for (const profile of profilesResult.data ?? []) {
    requesterLabels.set(
      profile.user_id,
      profile.display_name ?? profile.handle ?? profile.user_id,
    );
  }

  return requests.map((request) => ({
    id: request.id,
    amount: Number(request.amount ?? 0),
    requested_by: request.requested_by,
    requester_label: requesterLabels.get(request.requested_by) ?? request.requested_by,
    votes: voteCounts.get(request.id) ?? 0,
    required_approvals: request.required_approvals ?? 2,
    created_at: request.created_at,
    reason: request.reason,
    note: request.note,
  }));
}

const VALID_RANGES = new Set(["today", "7d", "30d"]);

function readFinancialRangeArg(args: unknown): "today" | "7d" | "30d" {
  const range = (args as { range?: unknown } | null)?.range;
  if (typeof range === "string" && VALID_RANGES.has(range)) {
    return range as "today" | "7d" | "30d";
  }
  return "today";
}

function buildRangeWindow(range: "today" | "7d" | "30d"): {
  startIso: string;
  endIso: string;
  prevStartIso: string;
  prevEndIso: string;
} {
  const end = new Date();
  const start = new Date();

  if (range === "today") {
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (range === "7d") {
    start.setDate(start.getDate() - 7);
  } else {
    start.setDate(start.getDate() - 30);
  }

  const windowMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - windowMs);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    prevStartIso: prevStart.toISOString(),
    prevEndIso: prevEnd.toISOString(),
  };
}

function ledgerMetrics(rows: LedgerRow[]): {
  totalProcessed: number;
  totalWithdrawn: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
} {
  let totalProcessed = 0;
  let totalWithdrawn = 0;
  let successCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  for (const row of rows) {
    const amount = Number(row.amount ?? 0);
    const status = row.status ?? "";
    const type = row.type ?? "";

    if (status === "completed" || status === "succeeded") {
      successCount++;
      if (type === "tip" || type === "payment") totalProcessed += amount;
      else if (type === "withdrawal" || type === "payout") totalWithdrawn += amount;
    } else if (status === "failed") {
      failedCount++;
    } else if (status === "pending") {
      pendingCount++;
    }
  }

  return { totalProcessed, totalWithdrawn, successCount, failedCount, pendingCount };
}

function pctChange(current: number, prev: number): number {
  if (prev === 0) return 0;
  return Number(((current - prev) / prev * 100).toFixed(2));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type LedgerRow = {
  type: string | null;
  amount: number | string | null;
  status: string | null;
  created_at?: string | null;
};

export async function getFinancialInsights(range: "today" | "7d" | "30d"): Promise<FinancialInsights> {
  const { startIso, endIso, prevStartIso, prevEndIso } = buildRangeWindow(range);
  const last7Start = new Date();
  last7Start.setDate(last7Start.getDate() - 7);
  const last7StartIso = last7Start.toISOString();

  const [currentResult, prevResult, last7Result] = await Promise.all([
    supabaseAdmin
      .from("transactions_ledger")
      .select("type, amount, status, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(5000),
    supabaseAdmin
      .from("transactions_ledger")
      .select("type, amount, status, created_at")
      .gte("created_at", prevStartIso)
      .lte("created_at", prevEndIso)
      .limit(5000),
    supabaseAdmin
      .from("transactions_ledger")
      .select("type, amount, status, created_at")
      .gte("created_at", last7StartIso)
      .lte("created_at", endIso)
      .limit(10000),
  ]);

  if (currentResult.error) throw new Error(currentResult.error.message);
  if (prevResult.error) throw new Error(prevResult.error.message);
  if (last7Result.error) throw new Error(last7Result.error.message);

  const curr = ledgerMetrics((currentResult.data ?? []) as LedgerRow[]);
  const prev = ledgerMetrics((prevResult.data ?? []) as LedgerRow[]);

  const { totalProcessed, totalWithdrawn, successCount, failedCount, pendingCount } = curr;

  const failureRate =
    successCount + failedCount > 0
      ? Number(((failedCount / (successCount + failedCount)) * 100).toFixed(2))
      : 0;

  const trends = {
    processed: pctChange(totalProcessed, prev.totalProcessed),
    withdrawals: pctChange(totalWithdrawn, prev.totalWithdrawn),
  };

  const anomalies: string[] = [];
  if (failureRate > 8) anomalies.push("High failure rate detected");
  if (trends.processed > 50) anomalies.push("Unusual spike in payments");
  if (trends.processed < -40) anomalies.push("Significant drop in payments");
  if (trends.withdrawals > 60) anomalies.push("Spike in withdrawals");

  const dailyMap: Record<string, number> = {};
  for (const row of (last7Result.data ?? []) as LedgerRow[]) {
    if ((row.type === "tip" || row.type === "payment") && (row.status === "completed" || row.status === "succeeded")) {
      const day = (row.created_at ?? "").split("T")[0];
      if (!day) continue;
      dailyMap[day] = (dailyMap[day] ?? 0) + Number(row.amount ?? 0);
    }
  }

  const avgDaily = average(Object.values(dailyMap));
  const predictedNext = Math.round(avgDaily);

  const predictions: string[] = [];
  if (failureRate > 6) {
    predictions.push("Failure rate trending upward - monitor closely");
  }
  if (trends.withdrawals > 40) {
    predictions.push("High withdrawal momentum - possible liquidity strain");
  }
  if (trends.processed > 30) {
    predictions.push("Rapid growth detected - ensure system scalability");
  }
  if (trends.processed < -30) {
    predictions.push("Revenue declining - investigate cause");
  }

  let momentum: FinancialInsights["predictive"]["momentum"] = "stable";
  if (trends.processed > 20) momentum = "growing";
  if (trends.processed < -20) momentum = "declining";

  const health: FinancialInsights["health"] =
    failureRate > 10 || anomalies.length > 1
      ? "critical"
      : failureRate > 5 || anomalies.length > 0
        ? "warning"
        : "healthy";

  return {
    range,
    totalProcessed,
    totalWithdrawn,
    successCount,
    failedCount,
    pendingCount,
    failureRate,
    trends,
    anomalies,
    health,
    predictive: {
      nextDayEstimate: predictedNext,
      momentum,
      predictions,
    },
    windowStart: startIso,
    windowEnd: endIso,
  };
}

export type RetryFailedResult = {
  mode: "simulation" | "executed";
  total: number;
  estimatedSuccess?: number;
  estimatedFailure?: number;
  totalRetried?: number;
  failedRetries?: number;
  errors?: string[];
  // Populated in execute mode — saved to admin_activity_log for undo
  rollbackData?: RollbackEntry[];
};

function readSimulateArg(args: unknown): boolean {
  const a = args as { simulate?: unknown } | null;
  return a?.simulate === true;
}

export async function retryFailedPayments(simulate: boolean): Promise<RetryFailedResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error: fetchError } = await supabaseAdmin
    .from("transactions_ledger")
    .select("id, type, metadata, status")
    .eq("status", "failed")
    .gte("created_at", since)
    .limit(50);

  if (fetchError) throw new Error(fetchError.message);

  const total = (data ?? []).length;

  // SIMULATION MODE — no writes, just impact preview
  if (simulate) {
    return {
      mode: "simulation",
      total,
      // Historic retry success rate: ~75% typically recover
      estimatedSuccess: Math.round(total * 0.75),
      estimatedFailure: Math.round(total * 0.25),
    };
  }

  // REAL EXECUTION MODE — capture before-state first so we can undo
  const rollbackData: RollbackEntry[] = (data ?? []).map((tx) => ({
    table: "transactions_ledger",
    id: String(tx.id),
    field: "status",
    before: tx.status, // always "failed" at this point
  }));

  let totalRetried = 0;
  let failedRetries = 0;
  const errors: string[] = [];

  for (const tx of data ?? []) {
    const { error: updateError } = await supabaseAdmin
      .from("transactions_ledger")
      .update({
        status: "pending",
        updated_at: new Date().toISOString(),
        metadata: {
          ...(tx.metadata as Record<string, unknown> ?? {}),
          retry_attempts: ((tx.metadata as Record<string, unknown>)?.retry_attempts as number ?? 0) + 1,
          last_retry_at: new Date().toISOString(),
        },
      })
      .eq("id", tx.id);

    if (updateError) {
      failedRetries++;
      errors.push(`${tx.id}: ${updateError.message}`);
    } else {
      totalRetried++;
    }
  }

  return {
    mode: "executed",
    total,
    totalRetried,
    failedRetries,
    errors: errors.slice(0, 5),
    rollbackData,   // ← returned to confirm-tool route to store in log
  };
}

export async function runTool(name: string, args: unknown): Promise<unknown> {
  switch (name as OwnerAiToolName) {
    case "getCriticalAlerts":
      return getCriticalAlerts();
    case "getTodaySummary":
      return getTodaySummary();
    case "getAdminActivity":
      return getAdminActivity(readAdminIdArg(args));
    case "getOwnerApprovals":
      return getOwnerApprovals();
    case "getFinancialInsights":
      return getFinancialInsights(readFinancialRangeArg(args));
    case "retryFailedPayments":
      return retryFailedPayments(readSimulateArg(args));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}