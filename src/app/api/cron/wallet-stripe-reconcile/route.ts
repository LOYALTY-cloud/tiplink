import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { sendAdminAlert } from "@/lib/alerts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/wallet-stripe-reconcile
 *
 * Compares each user's internal wallet balance (our DB) against the actual
 * available balance on their Stripe connected account.
 *
 * If the Stripe balance is $0 but our wallet shows > $0, it means either:
 *   - A tip was charged to the platform account instead of the connected account
 *   - A payout completed on Stripe but the webhook was missed
 *
 * Actions taken:
 *   - Logs every discrepancy to `wallet_stripe_discrepancies` table
 *   - Sends admin alert for discrepancies above $1 threshold
 *   - Does NOT auto-correct (admin must review and manually resolve)
 *
 * Runs daily at 3:30 AM UTC.
 */
export async function GET(req: Request) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const key = new URL(req.url).searchParams.get("key");
  if (!isCron && key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all users with a connected Stripe account and non-zero wallet balance
  const { data: profiles, error: profilesErr } = await supabaseAdmin
    .from("profiles")
    .select("user_id, handle, display_name, stripe_account_id")
    .not("stripe_account_id", "is", null);

  if (profilesErr || !profiles) {
    console.error("[wallet-stripe-reconcile] Failed to fetch profiles:", profilesErr);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const userIds = profiles.map((p) => p.user_id as string);

  // Fetch wallet balances for those users
  const { data: wallets, error: walletsErr } = await supabaseAdmin
    .from("wallets")
    .select("user_id, balance")
    .in("user_id", userIds.length > 0 ? userIds : ["_none_"]);

  if (walletsErr) {
    console.error("[wallet-stripe-reconcile] Failed to fetch wallets:", walletsErr);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const walletMap = new Map<string, number>(
    (wallets ?? []).map((w) => [w.user_id as string, Number(w.balance ?? 0)])
  );

  const discrepancies: {
    user_id: string;
    handle: string;
    stripe_account_id: string;
    our_balance: number;
    stripe_balance: number;
    drift: number;
    direction: "stripe_ahead" | "our_ahead";
  }[] = [];

  let checked = 0;
  let errors = 0;

  for (const profile of profiles) {
    const accountId = profile.stripe_account_id as string;
    const ourBalance = walletMap.get(profile.user_id as string) ?? 0;

    try {
      const stripeBalance = await stripe.balance.retrieve(
        {},
        { stripeAccount: accountId }
      );

      // Use available balance (what they can actually withdraw)
      const stripeAvailable =
        (stripeBalance.available.find((b) => b.currency === "usd")?.amount ?? 0) / 100;

      const drift = Math.round((ourBalance - stripeAvailable) * 100) / 100;
      checked++;

      // Only flag discrepancies above $1 threshold to avoid noise from timing
      if (Math.abs(drift) > 1) {
        discrepancies.push({
          user_id: profile.user_id as string,
          handle: (profile.handle as string) ?? "",
          stripe_account_id: accountId,
          our_balance: ourBalance,
          stripe_balance: stripeAvailable,
          drift,
          direction: drift > 0 ? "our_ahead" : "stripe_ahead",
        });
      }
    } catch (e) {
      // Skip revoked/deauthorized accounts
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("No such account") && !msg.includes("deauthorized")) {
        console.error(`[wallet-stripe-reconcile] Error for ${accountId}:`, msg);
        errors++;
      }
    }

    // Throttle to avoid Stripe rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  // Persist discrepancies
  if (discrepancies.length > 0) {
    await supabaseAdmin
      .from("wallet_stripe_discrepancies")
      .upsert(
        discrepancies.map((d) => ({
          user_id: d.user_id,
          stripe_account_id: d.stripe_account_id,
          our_balance: d.our_balance,
          stripe_balance: d.stripe_balance,
          drift: d.drift,
          direction: d.direction,
          detected_at: new Date().toISOString(),
          resolved: false,
        })),
        { onConflict: "user_id", ignoreDuplicates: false }
      );

    // Alert admin
    const topDrifts = discrepancies
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .slice(0, 5)
      .map((d) => `• @${d.handle}: our=$${d.our_balance.toFixed(2)} stripe=$${d.stripe_balance.toFixed(2)} drift=$${d.drift.toFixed(2)} (${d.direction})`)
      .join("\n");

    await sendAdminAlert({
      subject: `Wallet/Stripe balance drift detected — ${discrepancies.length} account(s)`,
      body: `${discrepancies.length} connected account(s) have balance discrepancies:\n\n${topDrifts}\n\nReview at /admin/revenue`,
      severity: discrepancies.some((d) => Math.abs(d.drift) > 50) ? "critical" : "warning",
      meta: { count: discrepancies.length, checked },
    });
  }

  console.log(
    `[wallet-stripe-reconcile] checked=${checked} discrepancies=${discrepancies.length} errors=${errors}`
  );

  return NextResponse.json({
    ok: true,
    checked,
    discrepancies: discrepancies.length,
    errors,
    details: discrepancies,
  });
}
