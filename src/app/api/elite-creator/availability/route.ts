import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ELITE_LIMIT = 10;

export async function GET() {
  try {
    const { count, error } = await supabaseAdmin
      .from("elite_creator_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved");

    if (error) {
      console.error("elite-creator/availability GET:", error);
      return NextResponse.json({ error: "Failed to load availability" }, { status: 500 });
    }

    const approvedCount = count ?? 0;
    return NextResponse.json({
      approvedCount,
      limit: ELITE_LIMIT,
      spotsLeft: Math.max(ELITE_LIMIT - approvedCount, 0),
      limitReached: approvedCount >= ELITE_LIMIT,
    });
  } catch (e) {
    console.error("elite-creator/availability GET:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
