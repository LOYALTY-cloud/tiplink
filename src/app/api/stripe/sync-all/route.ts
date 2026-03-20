import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/stripe/sync-all
 * Fetches the real status from Stripe for every user with a stripe_account_id
 * and updates the DB. Admin-only (requires service role key in header).
 */
export async function POST(req: Request) {
  // Simple auth: require the service role key as bearer token
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, stripe_account_id")
    .not("stripe_account_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { user_id: string; account: string; charges: boolean; payouts: boolean; error?: string }[] = [];

  for (const p of profiles || []) {
    try {
      const acct = await stripe.accounts.retrieve(p.stripe_account_id!);
      await supabaseAdmin
        .from("profiles")
        .update({
          stripe_charges_enabled: acct.charges_enabled ?? false,
          stripe_payouts_enabled: acct.payouts_enabled ?? false,
          stripe_onboarding_complete: Boolean(acct.charges_enabled && acct.payouts_enabled),
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
