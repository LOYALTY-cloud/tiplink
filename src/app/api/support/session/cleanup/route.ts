import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function handleCleanup(req: Request) {
  // Strict auth — accept Bearer header OR ?key= query param (Vercel cron compat)
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key");

  const headerOk = auth && cronSecret && auth === `Bearer ${cronSecret}`;
  const queryOk = queryKey && cronSecret && queryKey === cronSecret;

  if (!cronSecret || (!headerOk && !queryOk)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date().toISOString();
  let closedCount = 0;

  // Try the DB function first (returns count)
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    "close_stale_support_sessions"
  );

  if (!rpcError && typeof rpcResult === "number") {
    closedCount = rpcResult;
  } else {
    // Fallback: close waiting (>30m) and active (>60m) separately
    const waitingCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const activeCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: waitingClosed } = await supabaseAdmin
      .from("support_sessions")
      .update({ status: "closed", closed_by: "system", closed_at: now, updated_at: now })
      .eq("status", "waiting")
      .lt("updated_at", waitingCutoff)
      .select("id");

    const { data: activeClosed } = await supabaseAdmin
      .from("support_sessions")
      .update({ status: "closed", closed_by: "system", closed_at: now, updated_at: now })
      .eq("status", "active")
      .lt("updated_at", activeCutoff)
      .select("id");

    // Insert system message into each closed session so the user sees why
    const allClosed = [...(waitingClosed || []), ...(activeClosed || [])];
    if (allClosed.length > 0) {
      await supabaseAdmin.from("support_messages").insert(
        allClosed.map((s) => ({
          session_id: s.id,
          sender_type: "system",
          message: "This conversation was automatically closed due to inactivity. You can start a new chat anytime.",
        }))
      );
    }

    closedCount =
      (waitingClosed?.length || 0) + (activeClosed?.length || 0);
  }

  // Auto "admin left" — reassign active sessions where admin is inactive >15 min
  const adminIdleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: abandoned } = await supabaseAdmin
    .from("support_sessions")
    .update({
      status: "waiting",
      assigned_admin_id: null,
      assigned_admin_name: null,
      updated_at: now,
    })
    .eq("status", "active")
    .lt("updated_at", adminIdleCutoff)
    .select("id");

  const abandonedCount = abandoned?.length || 0;

  // Log to admin_actions audit trail
  if (closedCount > 0 || abandonedCount > 0) {
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: "00000000-0000-0000-0000-000000000000", // system
      action: "support_cleanup",
      metadata: {
        closed_count: closedCount,
        abandoned_reassigned: abandonedCount,
        timestamp: now,
      },
    });
  }

  return NextResponse.json({
    success: true,
    closed: closedCount,
    reassigned: abandonedCount,
    timestamp: now,
  });
}

export async function GET(req: Request) {
  return handleCleanup(req);
}

export async function POST(req: Request) {
  return handleCleanup(req);
}
