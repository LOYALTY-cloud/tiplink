import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/store/me
 *
 * Returns the authenticated creator's store (or null if none).
 */
export async function GET(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const { data: store, error } = await supabaseAdmin
    .from("creator_stores")
    .select("id, store_name, slug, description, is_active, billing_type, billing_status, grace_until, renews_at, stripe_subscription_id, avatar_url, banner_url, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Backward compatibility when billing columns are not migrated yet.
    const { data: legacyStore, error: legacyError } = await supabaseAdmin
      .from("creator_stores")
      .select("id, store_name, slug, description, is_active, stripe_subscription_id, avatar_url, banner_url, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (legacyError) {
      console.error("store/me:", legacyError);
      return NextResponse.json({ error: "Failed to load store" }, { status: 500 });
    }

    return NextResponse.json({
      store: legacyStore
        ? {
            ...legacyStore,
            billing_type: legacyStore.stripe_subscription_id ? "stripe" : "balance",
            billing_status: "active",
            grace_until: null,
            renews_at: null,
          }
        : null,
    });
  }

  return NextResponse.json({ store: store ?? null });
}
