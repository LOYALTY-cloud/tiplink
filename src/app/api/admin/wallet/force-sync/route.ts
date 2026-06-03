import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { getStripe } from "@/lib/stripe/server";
import { addLedgerEntry } from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * POST /api/admin/wallet/force-sync
 *
 * Syncs a user's internal wallet balance to match their Stripe connected account.
 *
 * Use when: Stripe shows $0 but the platform still shows a positive balance
 * (e.g. payout already happened but webhook was missed, or express-dashboard payout).
 *
 * Body: { user_id?: string, handle?: string, dry_run?: boolean }
 *
 * - If Stripe (available + pending) < DB balance → creates an "adjustment" ledger
 *   entry to bring the DB balance down to match Stripe.
 * - If Stripe > DB balance → no change (stripe_ahead); admin must investigate.
 * - dry_run: true → calculate and return without writing anything.
 */
export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "manage_users");

    const body = await req.json().catch(() => ({}));
    const { user_id, handle, dry_run = false } = body as {
      user_id?: string;
      handle?: string;
      dry_run?: boolean;
    };

    if (!user_id && !handle) {
      return NextResponse.json({ error: "Provide user_id or handle" }, { status: 400 });
    }

    // Resolve user
    const profileQuery = supabaseAdmin
      .from("profiles")
      .select("user_id, handle, display_name, stripe_account_id, stripe_payouts_enabled");

    const { data: profile, error: profileErr } = await (
      user_id
        ? profileQuery.eq("user_id", user_id).maybeSingle()
        : profileQuery.eq("handle", handle!).maybeSingle()
    );

    if (profileErr || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({
        ok: false,
        reason: "no_stripe_account",
        message: "User has no connected Stripe account — nothing to sync.",
        user_id: profile.user_id,
        handle: profile.handle,
      });
    }

    // Fetch DB wallet balance
    const { data: walletRow } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", profile.user_id)
      .maybeSingle();

    const dbBalance = Number(walletRow?.balance ?? 0);

    // Fetch real Stripe balance
    const stripe = getStripe();
    const stripeBal = await stripe.balance.retrieve(
      {},
      { stripeAccount: profile.stripe_account_id }
    );

    const stripeAvailable =
      (stripeBal.available ?? [])
        .filter((b) => b.currency === "usd")
        .reduce((s, b) => s + b.amount, 0) / 100;

    const stripePending =
      (stripeBal.pending ?? [])
        .filter((b) => b.currency === "usd")
        .reduce((s, b) => s + b.amount, 0) / 100;

    const stripeTotal = stripeAvailable + stripePending;
    const drift = Math.round((dbBalance - stripeTotal) * 100) / 100;

    // No discrepancy
    if (Math.abs(drift) < 0.01) {
      return NextResponse.json({
        ok: true,
        action: "no_change",
        message: "Balances already in sync.",
        user_id: profile.user_id,
        handle: profile.handle,
        db_balance: dbBalance,
        stripe_available: stripeAvailable,
        stripe_pending: stripePending,
        drift: 0,
      });
    }

    // Stripe is AHEAD — we can't safely auto-add money; needs investigation
    if (drift < 0) {
      return NextResponse.json({
        ok: false,
        action: "stripe_ahead",
        message: `Stripe has $${Math.abs(drift).toFixed(2)} more than the DB. Investigate before crediting — possible missed tip transfer.`,
        user_id: profile.user_id,
        handle: profile.handle,
        db_balance: dbBalance,
        stripe_available: stripeAvailable,
        stripe_pending: stripePending,
        drift,
      });
    }

    // OUR DB is ahead — DB balance exceeds Stripe reality
    // This means funds left Stripe (payout completed) but ledger wasn't debited
    if (dry_run) {
      return NextResponse.json({
        ok: true,
        action: "would_correct",
        message: `Dry run: would debit $${drift.toFixed(2)} from DB wallet to match Stripe.`,
        user_id: profile.user_id,
        handle: profile.handle,
        db_balance: dbBalance,
        stripe_available: stripeAvailable,
        stripe_pending: stripePending,
        drift,
      });
    }

    // Apply correction: create a negative ledger entry
    const correctionAmount = -Math.abs(drift);
    await addLedgerEntry({
      user_id: profile.user_id,
      type: "adjustment",
      amount: correctionAmount,
      reference_id: null,
      meta: {
        action: "admin_wallet_force_sync",
        reason: "Stripe balance lower than DB — payout likely completed without webhook debit",
        db_balance_before: dbBalance,
        stripe_available: stripeAvailable,
        stripe_pending: stripePending,
        stripe_account_id: profile.stripe_account_id,
        corrected_by_admin: session.userId,
        corrected_at: new Date().toISOString(),
      },
    });

    // Log admin action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      target_user: profile.user_id,
      action: "wallet_force_sync",
      metadata: {
        db_balance_before: dbBalance,
        stripe_available: stripeAvailable,
        stripe_pending: stripePending,
        correction_amount: correctionAmount,
        stripe_account_id: profile.stripe_account_id,
      },
      severity: "medium",
    });

    // Mark resolved in discrepancies table (if it exists)
    await supabaseAdmin
      .from("wallet_stripe_discrepancies")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("user_id", profile.user_id)
      .eq("resolved", false)
      .catch(() => {}); // Non-fatal — table may not have this row

    return NextResponse.json({
      ok: true,
      action: "corrected",
      message: `Corrected: debited $${Math.abs(drift).toFixed(2)} from DB wallet. Balance now matches Stripe.`,
      user_id: profile.user_id,
      handle: profile.handle,
      db_balance_before: dbBalance,
      db_balance_after: Math.round((dbBalance + correctionAmount) * 100) / 100,
      stripe_available: stripeAvailable,
      stripe_pending: stripePending,
      drift,
    });
  } catch (e) {
    console.error("[admin/wallet/force-sync]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
