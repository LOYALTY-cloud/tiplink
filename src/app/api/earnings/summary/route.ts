import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/earnings/summary
 * Returns monthly + all-time earnings summary with fee breakdown.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
  const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = authRes.user.id;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Fetch all tip_received entries this year (covers both month + YTD)
  const { data: tips } = await supabaseAdmin
    .from("transactions_ledger")
    .select("amount, created_at, reference_id")
    .eq("user_id", userId)
    .eq("type", "tip_received")
    .gte("created_at", startOfYear.toISOString())
    .order("created_at", { ascending: false });

  const rows = tips ?? [];

  // Get fee data from tips table
  const refIds = rows.filter((r) => r.reference_id).map((r) => r.reference_id!);
  const feeMap = new Map<string, { gross: number; platform_fee: number; net: number }>();

  if (refIds.length > 0) {
    for (let i = 0; i < refIds.length; i += 100) {
      const batch = refIds.slice(i, i + 100);
      const { data: tipRows } = await supabaseAdmin
        .from("tips")
        .select("id, amount, platform_fee, net")
        .in("id", batch);
      if (tipRows) {
        for (const t of tipRows) {
          feeMap.set(t.id, {
            gross: Number(t.amount ?? 0),
            platform_fee: Number(t.platform_fee ?? 0),
            net: Number(t.net ?? 0),
          });
        }
      }
    }
  }

  // Accumulate
  let monthGross = 0, monthFees = 0, monthNet = 0, monthCount = 0;
  let ytdGross = 0, ytdFees = 0, ytdNet = 0, ytdCount = 0;

  for (const r of rows) {
    const ts = new Date(r.created_at);
    const fee = r.reference_id && feeMap.has(r.reference_id)
      ? feeMap.get(r.reference_id)!
      : { gross: Number(r.amount), platform_fee: 0, net: Number(r.amount) };

    ytdGross += fee.gross;
    ytdFees += fee.platform_fee;
    ytdNet += fee.net;
    ytdCount += 1;

    if (ts >= startOfMonth) {
      monthGross += fee.gross;
      monthFees += fee.platform_fee;
      monthNet += fee.net;
      monthCount += 1;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    month: {
      gross: round(monthGross),
      fees: round(monthFees),
      net: round(monthNet),
      count: monthCount,
      label: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
    },
    ytd: {
      gross: round(ytdGross),
      fees: round(ytdFees),
      net: round(ytdNet),
      count: ytdCount,
      label: `${now.getFullYear()} Year-to-Date`,
    },
  });
}
