import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { handleCreatorProgress } from "@/lib/creatorTier";

export const runtime = "nodejs";

/**
 * GET /api/cron/approve-theme-sales?key=CRON_SECRET
 *
 * Moves theme_sales rows from 'pending' → 'approved' once the 3-day hold
 * has passed. Run on a schedule (e.g. every 6 hours via Vercel Cron).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (req.headers.get("x-vercel-cron") !== "1" && (!key || key !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const HOLD_DAYS = 3;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HOLD_DAYS);

  const { data: pending, error: fetchErr } = await supabaseAdmin
    .from("theme_sales")
    .select("id, seller_id, creator_earnings")
    .eq("status", "pending")
    .lt("created_at", cutoff.toISOString());

  if (fetchErr) {
    console.error("approve-theme-sales: fetch error", fetchErr);
    return NextResponse.json({ error: "Failed to fetch pending sales" }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ approved: 0, message: "No pending sales ready to approve" });
  }

  const ids = pending.map((s) => s.id);

  const { error: updateErr } = await supabaseAdmin
    .from("theme_sales")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .in("id", ids);

  if (updateErr) {
    console.error("approve-theme-sales: update error", updateErr);
    return NextResponse.json({ error: "Failed to approve sales" }, { status: 500 });
  }

  // Update creator tier progress for each newly approved sale (best-effort)
  for (const sale of pending) {
    try {
      await handleCreatorProgress(sale.seller_id, Number(sale.creator_earnings));
    } catch (e) {
      console.error(`approve-theme-sales: handleCreatorProgress failed for seller ${sale.seller_id}`, e);
    }
  }

  console.log(`approve-theme-sales: approved ${ids.length} sales`);
  return NextResponse.json({ approved: ids.length });
}
