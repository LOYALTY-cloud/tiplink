import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: withdrawal, error } = await supabaseAdmin
    .from("withdrawals")
    .select("id, amount, fee, net, status, payout_method, failure_reason, release_at, created_at")
    .eq("user_id", authData.user.id)
    .gte("created_at", recentCutoff)
    .in("status", ["pending", "approved", "paid", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load withdrawal" }, { status: 500 });
  }

  return NextResponse.json({ withdrawal: withdrawal ?? null });
}