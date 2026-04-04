import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    requireRole(session.role, "revenue");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseAdmin
    .from("transactions_ledger")
    .select("user_id, amount, created_at")
    .gte("created_at", today.toISOString())
    .eq("type", "tip_received");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  // Aggregate by user
  const grouped: Record<string, { user_id: string; total: number }> = {};

  for (const tx of data ?? []) {
    const id = tx.user_id;
    if (!grouped[id]) {
      grouped[id] = { user_id: id, total: 0 };
    }
    grouped[id].total += Number(tx.amount || 0);
  }

  const topIds = Object.values(grouped)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (topIds.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch profiles for top earners
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", topIds.map((u) => u.user_id));

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  const result = topIds.map((u) => {
    const profile = profileMap.get(u.user_id);
    return {
      user_id: u.user_id,
      name: profile?.display_name || "user",
      avatar: profile?.avatar_url || null,
      total: Math.round(u.total * 100) / 100,
    };
  });

  return NextResponse.json(result);
}
