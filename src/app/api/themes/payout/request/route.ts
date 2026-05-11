import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const MIN_PAYOUT = 10; // USD — must match balance API

/**
 * POST /api/themes/payout/request
 * Body: { amount: number }
 *
 * Validates available balance server-side (never trust the frontend),
 * then creates a payout_request row with status = 'pending'.
 * Actual Stripe transfer is executed separately by the process endpoint.
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;
  const lockType = "theme_payout";

  let body: { amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (amount < MIN_PAYOUT) {
    return NextResponse.json(
      { error: `Minimum payout is $${MIN_PAYOUT}` },
      { status: 400 }
    );
  }

  const lock = await acquireWalletLock(supabaseAdmin, userId, lockType, 120);
  if (!lock.ok) {
    return NextResponse.json({ error: "Another payout request is currently in progress" }, { status: 409 });
  }

  const roundedAmount = Math.round(amount * 100) / 100;

  try {
    // Require Stripe Connect to be set up and payouts enabled
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_payouts_enabled, stripe_restriction_state, stripe_disabled_reason")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ error: "Stripe account not connected" }, { status: 400 });
    }
    if (
      (profile as any)?.stripe_restriction_state === "restricted" ||
      (profile as any)?.stripe_restriction_state === "high_risk" ||
      (profile as any)?.stripe_restriction_state === "disconnected"
    ) {
      return NextResponse.json(
        {
          error: "Theme payouts are temporarily restricted on your Stripe account",
          reason: (profile as any)?.stripe_disabled_reason ?? null,
        },
        { status: 403 }
      );
    }
    if (!profile.stripe_payouts_enabled) {
      return NextResponse.json(
        { error: "Stripe payouts not yet enabled — complete onboarding first" },
        { status: 400 }
      );
    }

    // FIFO allocation over approved sales using remaining allocatable amount.
    const { data: approvedSales, error: salesErr } = await supabaseAdmin
      .from("theme_sales")
      .select("id, creator_earnings, reserved_amount, paid_out_amount, created_at")
      .eq("seller_id", userId)
      .eq("status", "approved")
      .order("created_at", { ascending: true });

    if (salesErr) {
      return NextResponse.json({ error: "Failed to verify balance" }, { status: 500 });
    }

    let remaining = roundedAmount;
    const allocations: Array<{ theme_sale_id: string; amount_allocated: number }> = [];

    for (const sale of approvedSales ?? []) {
      if (remaining <= 0.00001) break;
      const earnings = Number(sale.creator_earnings ?? 0);
      const reserved = Number(sale.reserved_amount ?? 0);
      const paidOut = Number(sale.paid_out_amount ?? 0);
      const available = Math.round((earnings - paidOut - reserved) * 100) / 100;
      if (available <= 0) continue;

      const take = Math.min(available, remaining);
      const roundedTake = Math.round(take * 100) / 100;
      if (roundedTake <= 0) continue;

      allocations.push({
        theme_sale_id: sale.id,
        amount_allocated: roundedTake,
      });
      remaining = Math.round((remaining - roundedTake) * 100) / 100;
    }

    if (allocations.length === 0 || Math.abs(remaining) > 0.00001) {
      return NextResponse.json({ error: "Insufficient allocatable balance" }, { status: 400 });
    }

    const { data: payout, error: insertErr } = await supabaseAdmin
      .from("payout_requests")
      .insert({
        user_id: userId,
        amount: roundedAmount,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select("id, amount, status, requested_at, created_at")
      .single();

    if (insertErr || !payout) {
      console.error("payout/request: insert error", insertErr);
      return NextResponse.json({ error: "Failed to create payout request" }, { status: 500 });
    }

    const allocationRows = allocations.map((a) => ({
      payout_request_id: payout.id,
      theme_sale_id: a.theme_sale_id,
      amount_allocated: a.amount_allocated,
    }));

    const { error: allocErr } = await supabaseAdmin
      .from("theme_payout_allocations")
      .insert(allocationRows);

    if (allocErr) {
      await supabaseAdmin.from("payout_requests").delete().eq("id", payout.id).eq("status", "pending");
      return NextResponse.json({ error: "Failed to reserve payout allocations" }, { status: 500 });
    }

    const applied: Array<{ saleId: string; amount: number }> = [];
    for (const a of allocations) {
      const { error: reserveErr } = await supabaseAdmin.rpc("increment_reserved_amount", {
        sale_id: a.theme_sale_id,
        amount: a.amount_allocated,
      });

      if (reserveErr) {
        for (const r of applied) {
          await supabaseAdmin.rpc("increment_reserved_amount", {
            sale_id: r.saleId,
            amount: -r.amount,
          });
        }
        await supabaseAdmin.from("theme_payout_allocations").delete().eq("payout_request_id", payout.id);
        await supabaseAdmin.from("payout_requests").delete().eq("id", payout.id).eq("status", "pending");
        return NextResponse.json({ error: "Failed to reserve payout balance" }, { status: 500 });
      }

      applied.push({ saleId: a.theme_sale_id, amount: a.amount_allocated });
    }

    // Notify creator: payout requested
    void createNotification({
      userId,
      type: "payout_requested",
      title: "Payout requested",
      body: `$${roundedAmount.toFixed(2)} is being prepared for transfer`,
      meta: { payout_id: payout.id, amount: roundedAmount },
    });


    return NextResponse.json({ payout });
  } finally {
    await releaseWalletLock(supabaseAdmin, userId, lockType);
  }
}
