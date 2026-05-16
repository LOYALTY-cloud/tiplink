import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { syncStripeAccount } from "@/lib/stripe/syncAccount";

export const runtime = "nodejs";

/**
 * POST /api/admin/stripe-sync
 * Body: { user_id: string }
 *
 * Forces a live sync of a creator's Stripe Connect account into the profiles table.
 * Requires admin session (any admin role).
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ error: "No Stripe account connected for this user" }, { status: 404 });
    }

    const result = await syncStripeAccount(profile.stripe_account_id, {
      eventType: "admin_manual_sync",
    });

    if (!result.success) {
      return NextResponse.json({ error: "Stripe sync failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      restriction_level: result.restrictionLevel,
      verification_status: result.verificationStatus,
    });
  } catch (e) {
    console.error("admin/stripe-sync error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
