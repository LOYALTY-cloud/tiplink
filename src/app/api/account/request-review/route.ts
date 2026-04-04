import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessToken = authHeader.slice("Bearer ".length);

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = userRes.user.id;

    // Only restricted accounts can request review
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.account_status !== "restricted") {
      return NextResponse.json({ error: "Account is not restricted" }, { status: 400 });
    }

    // Prevent spam: check for recent review request (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("admin_actions")
      .select("id")
      .eq("target_user", userId)
      .eq("action", "review_requested")
      .gte("created_at", oneDayAgo)
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json({ ok: true, message: "Review already requested" });
    }

    // Log the review request as an admin action for visibility
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: userId, // self-initiated
      action: "review_requested",
      target_user: userId,
      metadata: { source: "dashboard", requested_at: new Date().toISOString() },
      severity: "info",
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
