/**
 * AI Action Rollback API
 * POST /api/admin/ai/rollback
 *
 * Owner-only. Reverts a recorded AI action by restoring the before-state
 * captured in admin_activity_log.rollback_data.
 *
 * Body: { logId: string }
 * Returns: { ok, logId, restored, failed, errors }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { rollbackAction } from "@/lib/ai/rollback";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rollback is exclusively an owner capability — same as execution.
    try {
      requireRole(session.role, ["owner"]);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const logId = typeof body?.logId === "string" ? body.logId.trim() : "";

    if (!logId) {
      return NextResponse.json({ error: "logId is required" }, { status: 400 });
    }

    const result = await rollbackAction(logId, session.userId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[ai/rollback] error:", message);
    // Return 400 for business logic errors (not reversible, already rolled back)
    // vs 500 for unexpected failures.
    const is400 = message.includes("not reversible") || message.includes("already been rolled back") || message.includes("not found") || message.includes("No rollback data");
    return NextResponse.json({ error: message }, { status: is400 ? 400 : 500 });
  }
}
