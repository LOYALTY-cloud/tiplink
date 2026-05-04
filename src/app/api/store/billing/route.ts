import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/store/billing
 * Returns billing status for the authenticated creator's store.
 */
export async function GET(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId, owner_elite } = session;

  const { data: store, error } = await supabaseAdmin
    .from("creator_stores")
    .select("id, is_active, billing_type, renews_at, stripe_subscription_id, billing_status, grace_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Backward compatibility before billing columns are migrated.
    const { data: legacyStore, error: legacyError } = await supabaseAdmin
      .from("creator_stores")
      .select("id, is_active, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (legacyError) {
      console.error("store/billing:", legacyError);
      return NextResponse.json({ error: "Failed to load billing" }, { status: 500 });
    }

    let invoices: unknown[] = [];
    if (legacyStore?.id) {
      const { data: invoiceData } = await supabaseAdmin
        .from("store_invoices")
        .select("id, amount, status, billing_type, stripe_invoice_id, created_at, paid_at")
        .eq("store_id", legacyStore.id)
        .order("created_at", { ascending: false })
        .limit(20);
      invoices = invoiceData ?? [];
    }

    return NextResponse.json({
      store: legacyStore
        ? {
            id: legacyStore.id,
            is_active: legacyStore.is_active,
            billing_type: legacyStore.stripe_subscription_id ? "stripe" : "balance",
            renews_at: null,
            stripe_subscription_id: legacyStore.stripe_subscription_id,
            billing_status: "active",
            grace_until: null,
          }
        : null,
      owner_elite,
      invoices,
    });
  }

  const { data: invoices } = await supabaseAdmin
    .from("store_invoices")
    .select("id, amount, status, billing_type, stripe_invoice_id, created_at, paid_at")
    .eq("store_id", store?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ store: store ?? null, owner_elite, invoices: invoices ?? [] });
}
