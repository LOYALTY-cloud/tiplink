import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { handleStripeEvent, recordWebhookReplayResult } from "@/app/api/stripe/webhook/route";
import type { StripeWebhookEvent } from "@/types/stripe";

export const runtime = "nodejs";

type FailedWebhookRow = {
  event_id: string;
  event_type: string;
  payload: unknown;
  status: "failed" | "replay_failed" | "replayed_success";
  failure_count: number;
  retry_count: number;
  last_failed_at: string;
};

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "finance_admin"]);

    const body = await req.json().catch(() => ({}));
    const eventId = typeof body?.event_id === "string" ? body.event_id.trim() : "";
    const rawLimit = Number(body?.limit ?? 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 10;

    let query = supabaseAdmin
      .from("stripe_failed_webhook_events")
      .select("event_id, event_type, payload, status, failure_count, retry_count, last_failed_at")
      .order("last_failed_at", { ascending: true })
      .limit(limit);

    if (eventId) {
      query = query.eq("event_id", eventId);
    } else {
      query = query.in("status", ["failed", "replay_failed"]);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "Failed to load queued events" }, { status: 500 });
    }

    const rows = (data ?? []) as FailedWebhookRow[];
    if (!rows.length) {
      return NextResponse.json({ ok: true, replayed: 0, failed: 0, results: [] });
    }

    const results: Array<{
      event_id: string;
      event_type: string;
      success: boolean;
      error?: string;
    }> = [];

    let replayed = 0;
    let failed = 0;

    for (const row of rows) {
      const event = row.payload as StripeWebhookEvent;

      try {
        await handleStripeEvent(event);
        await recordWebhookReplayResult({
          event,
          success: true,
          adminUserId: session.userId,
        });

        replayed++;
        results.push({
          event_id: row.event_id,
          event_type: row.event_type,
          success: true,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await recordWebhookReplayResult({
          event,
          success: false,
          error: err,
          adminUserId: session.userId,
        });

        failed++;
        results.push({
          event_id: row.event_id,
          event_type: row.event_type,
          success: false,
          error: message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      replayed,
      failed,
      results,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
