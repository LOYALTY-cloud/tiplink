import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET /api/account/violations
// Returns the authenticated user's strikes and current risk level.
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [strikesRes, profileRes] = await Promise.all([
      supabaseAdmin
        .from("creator_strikes")
        .select("id, severity, reason, strike_points, status, created_at, expires_at, theme_id")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("profiles")
        .select("creator_strike_points, creator_risk_level, marketplace_disabled")
        .eq("user_id", user.id)
        .single(),
    ]);

    return NextResponse.json({
      strikes: strikesRes.data ?? [],
      creator_strike_points: profileRes.data?.creator_strike_points ?? 0,
      creator_risk_level:    profileRes.data?.creator_risk_level ?? "normal",
      marketplace_disabled:  profileRes.data?.marketplace_disabled ?? false,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
