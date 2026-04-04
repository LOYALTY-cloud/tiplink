import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export async function GET(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tickets, activeChats, waitingChats] = await Promise.all([
    supabaseAdmin
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
    supabaseAdmin
      .from("support_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("support_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "waiting"),
  ]);

  return NextResponse.json({
    tickets: tickets.count ?? 0,
    activeChats: activeChats.count ?? 0,
    waitingChats: waitingChats.count ?? 0,
  });
}
