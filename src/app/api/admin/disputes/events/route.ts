import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { logDisputeEvent } from "@/lib/disputeEvents";

export const runtime = "nodejs";

/**
 * GET — Fetch timeline events for a dispute
 * POST — Add an internal note to a dispute
 */
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const disputeId = searchParams.get("dispute_id");
    if (!disputeId) {
      return NextResponse.json({ error: "Missing dispute_id" }, { status: 400 });
    }

    const { data: events, error } = await supabaseAdmin
      .from("dispute_events")
      .select("*")
      .eq("dispute_id", disputeId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: "Failed to load dispute events." }, { status: 500 });
    const adminIds = [...new Set((events ?? []).map((e) => e.admin_id).filter(Boolean))];
    const profiles: Record<string, { handle: string | null; display_name: string | null }> = {};
    if (adminIds.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", adminIds);
      for (const p of profileData ?? []) {
        profiles[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
    }

    return NextResponse.json({ events: events ?? [], profiles });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { dispute_id, message } = await req.json();

    if (!dispute_id || typeof dispute_id !== "string") {
      return NextResponse.json({ error: "Missing dispute_id" }, { status: 400 });
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }
    if (message.trim().length > 2000) {
      return NextResponse.json({ error: "Message too long (max 2000 chars)" }, { status: 400 });
    }

    await logDisputeEvent(
      supabaseAdmin,
      dispute_id,
      "note",
      message.trim(),
      session.userId,
    );

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
