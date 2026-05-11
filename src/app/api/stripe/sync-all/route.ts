import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { evaluateStripeConnectPolicy } from "@/lib/stripe/connectRisk";

export const runtime = "nodejs";
export const maxDuration = 60;

function getSyncClients() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey || !stripeKey) {
    return null;
  }
  return {
    supabase: createClient(supabaseUrl, supabaseKey),
    stripe: new Stripe(stripeKey),
  };
}

/**
 * POST /api/stripe/sync-all
 * Fetches the real status from Stripe for every user with a stripe_account_id
 * and updates the DB. Admin-only (requires service role key in header).
 */
export async function POST(req: Request) {
  const clients = getSyncClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const { supabase: supabaseAdmin, stripe } = clients;

  // Admin JWT auth
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    requireRole(admin.role, "panic");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, stripe_account_id")
    .not("stripe_account_id", "is", null);

  if (error) {
    console.error("sync-all: profiles query failed", error);
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }

  const results: { user_id: string; account: string; charges: boolean; payouts: boolean; error?: string }[] = [];

  for (const p of profiles || []) {
    try {
      const acct = await stripe.accounts.retrieve(p.stripe_account_id!);
      const connectPolicy = evaluateStripeConnectPolicy(acct);
      await supabaseAdmin
        .from("profiles")
        .update({
          stripe_charges_enabled: acct.charges_enabled ?? false,
          stripe_payouts_enabled: acct.payouts_enabled ?? false,
          stripe_onboarding_complete: Boolean(acct.charges_enabled && acct.payouts_enabled),
          payouts_enabled: Boolean(acct.charges_enabled && acct.payouts_enabled),
          stripe_restriction_state: connectPolicy.state,
          stripe_verification_status: connectPolicy.verificationStatus,
          stripe_disabled_reason: connectPolicy.disabledReason,
          stripe_requirements_due_count: connectPolicy.currentlyDueCount,
          stripe_future_requirements_due_count: connectPolicy.futureDueCount,
          stripe_past_requirements_due_count: connectPolicy.pastDueCount,
          stripe_connect_risk_reasons: connectPolicy.reasons,
          stripe_connect_last_event_at: new Date().toISOString(),
          stripe_connect_last_event_type: "sync_all",
        })
        .eq("user_id", p.user_id);

      results.push({
        user_id: p.user_id,
        account: p.stripe_account_id!,
        charges: acct.charges_enabled ?? false,
        payouts: acct.payouts_enabled ?? false,
      });
    } catch (e: unknown) {
      results.push({
        user_id: p.user_id,
        account: p.stripe_account_id!,
        charges: false,
        payouts: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
