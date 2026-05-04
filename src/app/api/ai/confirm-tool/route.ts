/**
 * AI Tool Confirmation Endpoint
 * Handles execution of medium/high-risk tools after user confirmation
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { executeConfirmedTool } from "@/lib/ai/runToolSecure";
import { logAdminActivity } from "@/lib/adminActivityLog";
import { isRateLimited } from "@/lib/ai/rateLimiter";

export const runtime = "nodejs";

type ConfirmToolRequest = {
  tool: string;
  args: any;
  confirmationText?: string;
  simulation?: Record<string, unknown> | null;
};

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

    // Rate limit check
    const rateLimitCheck = isRateLimited(session.userId);
    if (rateLimitCheck.limited) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Max 10 requests per minute.",
          resetAt: rateLimitCheck.resetAt.toISOString(),
        },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as ConfirmToolRequest;
    const toolName = typeof body?.tool === "string" ? body.tool.trim() : "";
    const confirmationText = typeof body?.confirmationText === "string" ? body.confirmationText.trim() : "";
    const simulation = body?.simulation ?? null;

    if (!toolName) {
      return NextResponse.json({ error: "Tool name is required" }, { status: 400 });
    }

    // High-risk tools: require "EXECUTE" (stronger than "CONFIRM" to signal real action)
    if (confirmationText !== "EXECUTE") {
      await logAdminActivity({
        type: "system",
        action: "ai_execution_invalid_text",
        title: "Invalid execution confirmation text",
        description: `User did not type EXECUTE for tool: ${toolName}`,
        severity: "info",
        metadata: { toolName, adminId: session.userId },
      });

      return NextResponse.json(
        { error: "Please type 'EXECUTE' exactly to proceed" },
        { status: 400 }
      );
    }

    // Log the simulation acknowledgement before executing
    await logAdminActivity({
      type: "system",
      action: "ai_simulation_acknowledged",
      title: `Owner acknowledged simulation for: ${toolName}`,
      description: simulation
        ? `Simulation showed: total=${simulation.total}, estSuccess=${simulation.estimatedSuccess}, estFailure=${simulation.estimatedFailure}`
        : "No simulation data available",
      severity: "info",
      metadata: { toolName, adminId: session.userId, simulation },
    });

    // Execute the confirmed tool
    const result = await executeConfirmedTool({
      name: toolName,
      args: { ...body.args, simulate: false }, // Force simulate=false on real execution
      role: session.role,
      adminId: session.userId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Tool execution failed" },
        { status: 400 }
      );
    }

    // Persist the execution audit entry — with rollback data if the tool
    // captured before-state (makes the action undoable via /api/admin/ai/rollback).
    const toolData = result.data as Record<string, unknown> | undefined;
    const rollbackData = toolData?.rollbackData as import("@/lib/adminActivityLog").RollbackEntry[] | undefined;
    const hasRollback = Array.isArray(rollbackData) && rollbackData.length > 0;

    const executionLogId = await logAdminActivity({
      type: "system",
      action: "ai_execution",
      title: `AI executed: ${toolName}`,
      description: hasRollback
        ? `${rollbackData!.length} records affected. Action can be undone.`
        : `Action executed. No undo snapshot available.`,
      severity: "info",
      reversible: hasRollback,
      rollbackData: hasRollback ? rollbackData : null,
      metadata: {
        toolName,
        adminId: session.userId,
        result: toolData,
      },
      actor: session.userId,
    });

    return NextResponse.json({
      ok: true,
      tool: toolName,
      data: result.data,
      // Surface the log id so the UI can render an undo button
      logId: executionLogId,
      reversible: hasRollback,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[confirm-tool] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
