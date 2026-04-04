import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("type") || "all";

    let query = supabaseAdmin
      .from("transactions_ledger")
      .select("id, user_id, type, amount, reference_id, status, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter !== "all") {
      query = query.eq("type", filter);
    }

    const { data: rows } = await query;
    const ledger = rows ?? [];

    // Batch-fetch profiles for all user IDs
    const ids = [...new Set(ledger.map((r) => r.user_id))];
    let profileMap: Record<string, { handle: string | null; display_name: string | null }> = {};

    if (ids.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", ids);
      for (const p of profiles ?? []) {
        profileMap[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
    }

    return NextResponse.json({ rows: ledger, profileMap });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
