/**
 * /api/cron/stripe-reconcile
 *
 * Background reconciliation job — syncs every connected Stripe account that
 * hasn't been synced in the last hour.
 *
 * Intended to be called by Vercel Cron (see vercel.json) or an external
 * scheduler.  Protected by the CRON_SECRET env variable.
 *
 * Returns: { synced, failed, skipped, total }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncStripeAccount } from "@/lib/stripe/syncAccount";

export const runtime = "nodejs";
export const maxDuration = 300; // 5-min Vercel function budget

const BATCH_DELAY_MS = 250; // avoid Stripe rate-limits
const STALE_THRESHOLD_MINUTES = 60;

export async function GET(req: NextRequest) {
  // Validate caller
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const staleThreshold = new Date(
    Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000
  ).toISOString();

  // Fetch all profiles with a connected Stripe account that are stale or never synced
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id, stripe_last_synced_at")
    .not("stripe_account_id", "is", null)
    .or(`stripe_last_synced_at.is.null,stripe_last_synced_at.lt.${staleThreshold}`);

  if (error) {
    console.error("stripe-reconcile: failed to fetch profiles", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const total = profiles?.length ?? 0;
  let synced = 0;
  let failed = 0;

  for (const profile of profiles ?? []) {
    const accountId = profile.stripe_account_id as string;
    try {
      const result = await syncStripeAccount(accountId, { eventType: "cron_reconcile" });
      if (result.success) {
        synced++;
      } else {
        failed++;
        console.warn(`stripe-reconcile: failed ${accountId}`, result.error);
      }
    } catch (e) {
      failed++;
      console.error(`stripe-reconcile: exception ${accountId}`, e instanceof Error ? e.message : e);
    }

    // Small delay between accounts to stay within Stripe rate limits
    if (BATCH_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`stripe-reconcile complete: total=${total} synced=${synced} failed=${failed}`);
  return NextResponse.json({ total, synced, failed, skipped: 0 });
}
