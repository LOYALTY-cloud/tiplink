import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/store/check-name?name=...
 * Returns { available: boolean } — whether the store name is available.
 * Excludes the caller's own store so editing their existing name shows "available".
 */
export async function GET(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ available: true });

  // Get caller's own store id so we can exclude it
  const { data: ownStore } = await supabaseAdmin
    .from("creator_stores")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const query = supabaseAdmin
    .from("creator_stores")
    .select("id")
    .ilike("store_name", name);

  if (ownStore?.id) {
    query.neq("id", ownStore.id);
  }

  const { data } = await query.maybeSingle();

  return NextResponse.json({ available: !data });
}
