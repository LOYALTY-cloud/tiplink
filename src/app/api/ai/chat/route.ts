import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { BLOCKED_MESSAGE, guardInput, guardOutput } from "@/lib/aiGuard";
import { detectOwnerAiIntent, extractFinancialRange, OWNER_AI_HELP_REPLY } from "@/lib/ai/ownerRouter";
import { requireRole } from "@/lib/auth/requireRole";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { logAdminActivity } from "@/lib/adminActivityLog";
import { runTool, tools } from "@/lib/ai/tools";
import { validateAIInput, validateAIOutput, runToolSecure } from "@/lib/ai/runToolSecure";
import { isRateLimited, isGloballyRateLimited } from "@/lib/ai/rateLimiter";

export const runtime = "nodejs";

type ToolResponse = {
  tool: string;
  reply: string;
  data?: unknown;
  requiresConfirmation?: boolean;
  requiresReAuth?: boolean;
  simulation?: Record<string, unknown>;
  pendingTool?: string;
  pendingArgs?: any;
};

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function buildSystemPrompt(): string {
  return [
    "You are the owner AI operator for a fintech admin system.",
    "Use tools to fetch live platform data whenever the user asks about counts, alerts, summaries, approval queues, or admin activity.",
    "Do not guess live data. If you need data, call a tool.",
    "Keep answers concise, operational, and clear for the owner.",
    "Never claim you executed an action unless a tool explicitly did it. These tools are read-only.",
    "If the user asks for unsupported data, say what you can help with instead.",
  ].join(" ");
}

function normalizeIncomingMessages(messages: unknown): IncomingMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message): message is IncomingMessage => {
      return !!message
        && typeof message === "object"
        && (((message as IncomingMessage).role === "user") || ((message as IncomingMessage).role === "assistant"))
        && typeof (message as IncomingMessage).content === "string";
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 1000),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);
}

function toOpenAiTools() {
  return tools.map((tool) => ({
    type: "function" as const,
    function: tool,
  }));
}

function isFunctionToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall {
  return toolCall.type === "function";
}

async function fallbackRoute(message: string): Promise<ToolResponse> {
  const intent = detectOwnerAiIntent(message);

  if (intent.tool === "critical_alerts") {
    const data = await runTool("getCriticalAlerts", {});
    const alerts = Array.isArray(data) ? data : [];
    return {
      tool: "getCriticalAlerts",
      reply: alerts.length === 0
        ? "No active critical alerts right now."
        : `There ${alerts.length === 1 ? "is" : "are"} ${alerts.length} active critical alert${alerts.length === 1 ? "" : "s"}.`,
      data,
    };
  }

  if (intent.tool === "today_summary") {
    const data = await runTool("getTodaySummary", {});
    const summary = data as { totalEvents?: number; recentEvents?: { title: string; type: string; action: string | null; severity: string; actor: string | null; created_at: string }[] } | null;
    const totalEvents = summary?.totalEvents ?? 0;
    const recent = summary?.recentEvents ?? [];
    const lines = [`Today has ${totalEvents} logged admin event${totalEvents === 1 ? "" : "s"}.`];
    if (recent.length > 0) {
      lines.push("", "Recent events:");
      for (const e of recent.slice(0, 10)) {
        const time = new Date(e.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
        const actor = e.actor ? ` by ${e.actor}` : "";
        lines.push(`• [${time}] ${e.title}${actor} (${e.type}, ${e.severity})`);
      }
    }
    return {
      tool: "getTodaySummary",
      reply: lines.join("\n"),
      data,
    };
  }

  if (intent.tool === "owner_approvals") {
    const data = await runTool("getOwnerApprovals", {});
    const approvals = Array.isArray(data) ? data : [];
    return {
      tool: "getOwnerApprovals",
      reply: approvals.length === 0
        ? "No pending refunds currently require owner approval."
        : `There ${approvals.length === 1 ? "is" : "are"} ${approvals.length} pending refund request${approvals.length === 1 ? "" : "s"} waiting on owner approval.`,
      data,
    };
  }

  if (intent.tool === "financial_insights") {
    const range = extractFinancialRange(message);
    const data = await runTool("getFinancialInsights", { range });
    const fi = data as {
      totalProcessed?: number;
      totalWithdrawn?: number;
      successCount?: number;
      failedCount?: number;
      failureRate?: number;
      trends?: { processed?: number; withdrawals?: number };
      anomalies?: string[];
      health?: string;
      predictive?: {
        nextDayEstimate?: number;
        momentum?: "stable" | "growing" | "declining";
        predictions?: string[];
      };
    } | null;
    const label = range === "today" ? "today" : range === "7d" ? "the last 7 days" : "the last 30 days";
    const processed = ((fi?.totalProcessed ?? 0) / 100).toFixed(2);
    const withdrawn = ((fi?.totalWithdrawn ?? 0) / 100).toFixed(2);
    const rate = fi?.failureRate ?? 0;
    const health = fi?.health ?? "healthy";
    const healthEmoji = health === "critical" ? "🔴" : health === "warning" ? "🟡" : "🟢";
    const trendProcessed = fi?.trends?.processed ?? 0;
    const trendWithdrawals = fi?.trends?.withdrawals ?? 0;
    const fmt = (n: number) => (n >= 0 ? `+${n}%` : `${n}%`);
    const anomalies = fi?.anomalies ?? [];
    const outlook = fi?.predictive;
    const momentum = outlook?.momentum ?? "stable";
    const momentumEmoji = momentum === "growing" ? "📈" : momentum === "declining" ? "📉" : "➡️";
    const lines = [
      `Financial summary for ${label}:`,
      `• $${processed} processed in payments (${fmt(trendProcessed)} vs prior period)`,
      `• $${withdrawn} withdrawn (${fmt(trendWithdrawals)} vs prior period)`,
      `• ${fi?.successCount ?? 0} successful, ${fi?.failedCount ?? 0} failed`,
      ``,
      `${healthEmoji} Health: ${health} — failure rate ${rate}%`,
    ];
    if (anomalies.length > 0) {
      lines.push(``, `Anomalies:`);
      for (const a of anomalies) lines.push(`• ${a}`);
    }
    lines.push(
      "",
      "Financial Outlook:",
      `• Estimated next-day volume: $${(((outlook?.nextDayEstimate ?? 0) as number) / 100).toFixed(2)}`,
      `• Momentum: ${momentum} ${momentumEmoji}`,
    );
    if ((outlook?.predictions?.length ?? 0) > 0) {
      lines.push("", "Predictions:");
      for (const item of outlook?.predictions ?? []) lines.push(`• ${item}`);
    }
    return { tool: "getFinancialInsights", reply: lines.join("\n"), data };
  }

  if (intent.tool === "admin_activity" && intent.adminId) {
    const data = await runTool("getAdminActivity", { adminId: intent.adminId });
    const events = Array.isArray(data) ? data : [];
    return {
      tool: "getAdminActivity",
      reply: events.length === 0
        ? `No recent activity found for admin ${intent.adminId}.`
        : `Found ${events.length} recent activity item${events.length === 1 ? "" : "s"} for admin ${intent.adminId}.`,
      data,
    };
  }

  return {
    tool: "help",
    reply: OWNER_AI_HELP_REPLY,
  };
}

async function runGptToolLoop(
  client: OpenAI,
  history: IncomingMessage[],
  role: string,
  adminId: string,
): Promise<ToolResponse> {
  const transcript: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  let lastToolName: string | null = null;
  let lastToolData: unknown = null;

  for (let step = 0; step < 3; step += 1) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: transcript,
      tools: toOpenAiTools(),
      tool_choice: "auto",
      temperature: 0.2,
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      return { tool: lastToolName ?? "help", reply: OWNER_AI_HELP_REPLY, data: lastToolData ?? null };
    }

    if (!message.tool_calls?.length) {
      return {
        tool: lastToolName ?? "help",
        reply: message.content?.trim() || OWNER_AI_HELP_REPLY,
        data: lastToolData ?? null,
      };
    }

    const functionToolCalls = message.tool_calls.filter(isFunctionToolCall);

    transcript.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: functionToolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
      })),
    });

    for (const toolCall of functionToolCalls) {
      const toolName = toolCall.function.name;

      // SECURITY LAYER 1: Output validation (ensure tool name is allowed)
      if (!validateAIOutput(toolName)) {
        await logAdminActivity({
          type: "system",
          action: "ai_tool_blocked",
          title: "AI blocked invalid tool request",
          description: `Attempted to call blocked tool: ${toolName}`,
          severity: "warning",
          metadata: { toolName, adminId },
        });
        return {
          tool: "help",
          reply: "❌ I cannot execute that tool. Please try something else.",
        };
      }

      const args = JSON.parse(toolCall.function.arguments || "{}");

      // SECURITY LAYER 2-3: Execute with permission and risk checks
      const execResult = await runToolSecure({
        name: toolName,
        args,
        role,
        adminId,
      });

      if (!execResult.ok) {
        await logAdminActivity({
          type: "system",
          action: "ai_tool_denied",
          title: "AI tool execution denied",
          description: execResult.error || "Permission denied",
          severity: "warning",
          metadata: { toolName, adminId },
        });
        return {
          tool: "help",
          reply: `❌ Access denied: ${execResult.error}`,
        };
      }

      // Check if confirmation is required
      if (execResult.requiresConfirmation) {
        const reAuthNeeded = execResult.requiresReAuth;
        const simulation = execResult.simulation;
        const simSummary = simulation
          ? `Total affected: ${simulation.total ?? "unknown"}. Est. success: ${simulation.estimatedSuccess ?? "N/A"}, est. failure: ${simulation.estimatedFailure ?? "N/A"}. Nothing has changed yet.`
          : "Preview unavailable.";
        return {
          tool: toolName,
          reply: reAuthNeeded
            ? `🔐 High-risk action. Simulation complete — ${simSummary}\n\nReview the impact above, then type "EXECUTE" to confirm.`
            : `⚠️ This action requires confirmation.`,
          requiresConfirmation: true,
          requiresReAuth: reAuthNeeded,
          simulation,
          pendingTool: toolName,
          pendingArgs: args,
        };
      }

      // Auto-execute (low-risk)
      lastToolName = toolName;
      lastToolData = execResult.data;

      transcript.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(execResult.data),
      });
    }
  }

  return {
    tool: lastToolName ?? "help",
    reply: "I hit the tool-call depth limit. Try asking in a narrower way.",
    data: lastToolData ?? null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      requireRole(session.role, ["owner"]);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // SECURITY: Rate limiting
    const rateLimitCheck = isRateLimited(session.userId);
    if (rateLimitCheck.limited) {
      await logAdminActivity({
        type: "system",
        action: "ai_rate_limited",
        title: "Owner AI rate limit exceeded",
        description: `Admin exceeded 10 requests/minute. Resets at ${rateLimitCheck.resetAt.toISOString()}`,
        severity: "warning",
        metadata: {
          adminId: session.userId,
          resetAt: rateLimitCheck.resetAt.toISOString(),
        },
      });
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Max 10 requests per minute.",
          resetAt: rateLimitCheck.resetAt.toISOString(),
        },
        { status: 429 }
      );
    }

    const globalRateLimit = isGloballyRateLimited();
    if (globalRateLimit.limited) {
      return NextResponse.json(
        { error: "System rate limit exceeded. Please try again in a moment." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history = normalizeIncomingMessages(body?.messages);

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // SECURITY: Input validation (block jailbreak attempts)
    if (!validateAIInput(message)) {
      await logAdminActivity({
        type: "system",
        action: "ai_input_blocked",
        title: "Owner AI prompt blocked - policy violation",
        description: "Input failed security validation",
        severity: "warning",
        metadata: { adminId: session.userId },
      });
      return NextResponse.json({ reply: BLOCKED_MESSAGE, blocked: true });
    }

    const inputCheck = guardInput(message);
    if (!inputCheck.safe) {
      void logAdminActivity({
        type: "system",
        title: "Owner AI prompt blocked",
        description: inputCheck.reason,
        actor: session.userId,
        action: "owner_ai_blocked",
        label: inputCheck.reason,
        severity: "warning",
      });
      return NextResponse.json({ reply: BLOCKED_MESSAGE, blocked: true });
    }

    for (const entry of history) {
      if (entry.role !== "user") continue;
      const check = guardInput(entry.content);
      if (!check.safe) {
        return NextResponse.json({ reply: BLOCKED_MESSAGE, blocked: true });
      }
    }

    const client = getOpenAI();
    const result = client
      ? await runGptToolLoop(client, history.length > 0 ? history : [{ role: "user", content: message }], session.role, session.userId)
      : await fallbackRoute(message);

    const guardedReply = guardOutput(result.reply);

    void logAdminActivity({
      type: "system",
      title: client ? "Owner AI GPT tool call" : "Owner AI fallback tool call",
      description: result.tool,
      actor: session.userId,
      action: "owner_ai_query",
      label: result.tool,
      severity: "info",
      metadata: {
        tool: result.tool,
        mode: client ? "gpt_tools" : "fallback",
        requiresConfirmation: result.requiresConfirmation ?? false,
        rateLimitRemaining: rateLimitCheck.remainingRequests,
      },
    });

    return NextResponse.json({
      tool: result.tool,
      reply: guardedReply.text,
      data: result.data ?? null,
      filtered: guardedReply.safe ? false : true,
      requiresConfirmation: result.requiresConfirmation ?? false,
      requiresReAuth: result.requiresReAuth ?? false,
      simulation: result.simulation ?? null,
      pendingTool: result.pendingTool ?? null,
      pendingArgs: result.pendingArgs ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}