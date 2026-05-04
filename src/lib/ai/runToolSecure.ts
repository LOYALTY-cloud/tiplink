/**
 * Central Tool Executor with Security Guardrails
 * Enforces role, risk, and execution control
 *
 * Three-layer security:
 * Layer 1: Role enforcement
 * Layer 2: Tool permissions checking
 * Layer 3: Risk-based execution control
 */

import { logAdminActivity } from "@/lib/adminActivityLog";
import { canRoleAccessTool, getRiskLevel, toolSupportsSimulation, type RiskLevel } from "@/lib/ai/toolPermissions";
import { runTool } from "@/lib/ai/tools";

export type ToolExecutionResult = {
  ok: boolean;
  requiresConfirmation?: boolean;
  requiresReAuth?: boolean;
  simulation?: Record<string, unknown>;
  toolName?: string;
  args?: any;
  data?: unknown;
  error?: string;
};

const BLOCKED_TOOLS = new Set([
  "deleteUser",
  "deleteUserBalance",
  "resetBalance",
  "bypassStripe",
  "accessCredentials",
  "modifyAdminRole",
  "disableAuth",
]);

const BLOCKED_PATTERNS = [
  /ignore\s+rules/i,
  /bypass/i,
  /delete.*user/i,
  /reset.*balance/i,
];

/**
 * Validate input before sending to GPT
 * Blocks obvious jailbreak attempts
 */
export function validateAIInput(message: string): boolean {
  if (!message || typeof message !== "string") return false;

  const cleaned = message.toLowerCase().trim();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cleaned)) {
      return false;
    }
  }

  // Max length check
  if (message.length > 5000) {
    return false;
  }

  return true;
}

/**
 * Validate GPT output - ensure tool name is allowed
 */
export function validateAIOutput(toolName: string): boolean {
  if (!toolName || typeof toolName !== "string") return false;

  if (BLOCKED_TOOLS.has(toolName)) {
    return false;
  }

  // Tool name should be in camelCase (rough check)
  if (!/^[a-z][a-zA-Z0-9]*$/.test(toolName)) {
    return false;
  }

  return true;
}

/**
 * Core tool executor with role + permission + risk enforcement
 */
export async function runToolSecure({
  name,
  args,
  role,
  adminId,
}: {
  name: string;
  args: any;
  role: string;
  adminId: string;
}): Promise<ToolExecutionResult> {
  try {
    // LAYER 1: Role Enforcement
    if (!role || role === "user" || role === "anon") {
      await logAdminActivity({
        type: "system",
        action: "ai_tool_access_denied",
        title: "AI tool access denied - insufficient role",
        description: `Attempted to execute tool: ${name}`,
        severity: "warning",
        metadata: {
          toolName: name,
          role: role || "unknown",
          reason: "insufficient_role",
        },
      });
      return {
        ok: false,
        error: "Unauthorized: only admins can use AI tools",
      };
    }

    // LAYER 2: Tool Permissions & Validation
    if (!validateAIOutput(name)) {
      await logAdminActivity({
        type: "system",
        action: "ai_tool_blocked",
        title: "AI tool blocked - not allowed",
        description: `Blocked tool request: ${name}`,
        severity: "warning",
        metadata: {
          toolName: name,
          blockedTool: BLOCKED_TOOLS.has(name),
        },
      });
      return {
        ok: false,
        error: "Tool not allowed",
      };
    }

    if (!canRoleAccessTool(role, name)) {
      await logAdminActivity({
        type: "system",
        action: "ai_tool_access_denied",
        title: "AI tool access denied - insufficient permissions",
        description: `Tool ${name} requires higher privileges`,
        severity: "warning",
        metadata: {
          toolName: name,
          role,
          reason: "permission_denied",
        },
      });
      return {
        ok: false,
        error: `Tool "${name}" is not available for role: ${role}`,
      };
    }

    // LAYER 3: Risk-based Execution Control
    const riskLevel = getRiskLevel(name);

    if (riskLevel === "high") {
      // Always simulate first so the owner can review impact
      let simulation: Record<string, unknown> | undefined;

      if (toolSupportsSimulation(name)) {
        try {
          const simResult = await runTool(name as any, { ...args, simulate: true });
          simulation = simResult as Record<string, unknown>;
        } catch {
          // Non-fatal: proceed to confirmation without simulation data
        }
      }

      await logAdminActivity({
        type: "system",
        action: "ai_tool_simulated",
        title: `AI simulated high-risk tool: ${name}`,
        description: simulation
          ? `Simulation complete — ${JSON.stringify(simulation)}`
          : `No simulation available for ${name}`,
        severity: "info",
        metadata: { toolName: name, riskLevel, adminId, simulation },
      });

      return {
        ok: true,
        requiresConfirmation: true,
        requiresReAuth: true,
        simulation,
        toolName: name,
        args,
      };
    }

    if (riskLevel === "medium") {
      // Medium-risk: require confirmation only
      return {
        ok: true,
        requiresConfirmation: true,
        toolName: name,
        args,
      };
    }

    // Low-risk: auto-execute
    const data = await runTool(name as any, args);

    await logAdminActivity({
      type: "system",
      action: "ai_tool_executed",
      title: `AI tool executed: ${name}`,
      description: `Tool automatically executed (low-risk)`,
      severity: "info",
      metadata: {
        toolName: name,
        riskLevel,
        adminId,
        argsKeys: Object.keys(args || {}),
      },
    });

    return {
      ok: true,
      toolName: name,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await logAdminActivity({
      type: "system",
      action: "ai_tool_error",
      title: "AI tool execution error",
      description: `Error executing tool ${name}: ${message}`,
      severity: "warning",
      metadata: {
        toolName: name,
        error: message,
        adminId,
      },
    });

    return {
      ok: false,
      error: message,
    };
  }
}

/**
 * Execute a tool after confirmation (for medium/high risk tools).
 * Called after user has typed the required confirmation text in the UI.
 *
 * The confirmation text ("CONFIRM" / "EXECUTE") is the re-auth gate and is
 * enforced by the confirm-tool route BEFORE this function is called.
 * No separate token is needed here — the route owns that gate.
 *
 * The confirm-tool route writes the definitive audit log entry (with rollback
 * data), so we do NOT write a second log here for the normal success path.
 */
export async function executeConfirmedTool({
  name,
  args,
  role,
  adminId,
}: {
  name: string;
  args: any;
  role: string;
  adminId: string;
}): Promise<ToolExecutionResult> {
  try {
    // Re-validate permissions on the way in (defence-in-depth)
    if (!validateAIOutput(name) || !canRoleAccessTool(role, name)) {
      return {
        ok: false,
        error: "Permission denied",
      };
    }

    // Execute the tool
    const data = await runTool(name as any, args);

    // NOTE: The caller (confirm-tool route) writes the audit log so that it
    // can include reversible/rollback data. Do NOT duplicate it here.

    return {
      ok: true,
      toolName: name,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Log errors — these are unexpected and valuable for debugging
    await logAdminActivity({
      type: "system",
      action: "ai_tool_confirmed_error",
      title: "Error executing confirmed tool",
      description: message,
      severity: "warning",
      metadata: { toolName: name, error: message, adminId },
    });

    return {
      ok: false,
      error: message,
    };
  }
}
