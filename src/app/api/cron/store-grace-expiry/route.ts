import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/cron/store-grace-expiry?key=CRON_SECRET
 * Deactivates stores that are still past_due after grace_until.
 */
export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = new URL(req.url).searchParams.get("key");
  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: expiredStores, error } = await supabaseAdmin
    .from("creator_stores")
    .select("id")
    .eq("billing_status", "past_due")
    .not("grace_until", "is", null)
    .lte("grace_until", now)
    .eq("is_active", true)
    .limit(200);

  if (error) {
    console.error("[store-grace-expiry] failed to load stores:", error);
    return NextResponse.json({ error: "Failed to load expired stores." }, { status: 500 });
  }

  let deactivated = 0;

  for (const store of expiredStores ?? []) {
    const { error: deactivateErr } = await supabaseAdmin
      .from("creator_stores")
      .update({
        is_active: false,
        billing_status: "canceled",
        grace_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", store.id);

    if (deactivateErr) {
      console.error("[store-grace-expiry] failed to deactivate store", store.id, deactivateErr);
      continue;
    }

    // Hide themes — preserve store_id so they auto-restore on renewal
    await supabaseAdmin
      .from("themes")
      .update({ is_market_active: false, is_public: false })
      .eq("store_id", store.id);

    deactivated += 1;
  }

  return NextResponse.json({ ok: true, deactivated, scanned: (expiredStores ?? []).length });
}
