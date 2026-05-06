import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * POST /api/themes/payout/process
 *
 * Secured by CRON_SECRET — called by a Vercel Cron job (or admin trigger).
 * Processes all payout_requests with status = 'pending':
 *   1. Fetch the creator's Stripe Connect account ID.
 *   2. Create a Stripe transfer to that account.
 *   3. Mark the payout_request as 'paid'.
 *   4. Mark the corresponding approved theme_sales rows as 'paid'.
 *
 * If the Stripe transfer fails, the request is marked 'failed' with a reason.
 */
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (req.headers.get("x-vercel-cron") !== "1" && (!key || key !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pending, error: fetchErr } = await supabaseAdmin
    .from("payout_requests")
    .select("id, user_id, amount")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (fetchErr) {
    console.error("payout/process: fetch error", fetchErr);
    return NextResponse.json({ error: "Failed to fetch payout requests" }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0, message: "No pending payout requests" });
  }

  let processed = 0;
  let failed = 0;

  for (const payout of pending) {
    let transferId: string | null = null;
    let allocationsForRollback: Array<{ theme_sale_id: string; amount_allocated: number }> = [];
    try {
      const processingAt = new Date().toISOString();

      // Lock: mark as processing to prevent double-processing
      const { data: lockedRow, error: lockErr } = await supabaseAdmin
        .from("payout_requests")
        .update({ status: "processing", processed_at: processingAt })
        .eq("id", payout.id)
        .eq("status", "pending") // atomic check — skip if already grabbed
        .select("id")
        .maybeSingle();

      if (lockErr) {
        console.error(`payout/process: lock error for ${payout.id}`, lockErr);
        failed++;
        continue;
      }
      if (!lockedRow) {
        // Another worker/process already claimed it.
        continue;
      }

      // Notify creator: payout is now being processed
      void createNotification({
        userId: payout.user_id,
        type: "payout_processing",
        title: "Payout processing",
        body: "We're sending your money now",
        meta: { payout_id: payout.id, amount: Number(payout.amount) },
      });


      // Fetch Stripe account for creator
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_account_id, stripe_payouts_enabled")
        .eq("user_id", payout.user_id)
        .maybeSingle();

      if (!profile?.stripe_account_id || !profile.stripe_payouts_enabled) {
        const { data: earlyAllocations } = await supabaseAdmin
          .from("theme_payout_allocations")
          .select("theme_sale_id, amount_allocated")
          .eq("payout_request_id", payout.id);

        for (const alloc of earlyAllocations ?? []) {
          await supabaseAdmin.rpc("increment_reserved_amount", {
            sale_id: alloc.theme_sale_id,
            amount: -Number(alloc.amount_allocated),
          });
        }

        await supabaseAdmin
          .from("payout_requests")
          .update({ status: "failed", failure_reason: "Stripe account not connected or payouts not enabled", processed_at: new Date().toISOString() })
          .eq("id", payout.id);
        void createNotification({
          userId: payout.user_id,
          type: "payout_failed",
          title: "Payout failed",
          body: "Your Stripe account isn't connected or payouts aren't enabled yet.",
          meta: { payout_id: payout.id, amount: Number(payout.amount) },
        });

        failed++;
        continue;
      }

      const { data: allocations, error: allocErr } = await supabaseAdmin
        .from("theme_payout_allocations")
        .select("theme_sale_id, amount_allocated")
        .eq("payout_request_id", payout.id);

      if (allocErr || !allocations || allocations.length === 0) {
        await supabaseAdmin
          .from("payout_requests")
          .update({ status: "failed", failure_reason: "Missing payout allocations", processed_at: new Date().toISOString() })
          .eq("id", payout.id);
        void createNotification({
          userId: payout.user_id,
          type: "payout_failed",
          title: "Payout failed",
          body: "Something went wrong. Please try again or contact support.",
          meta: { payout_id: payout.id, amount: Number(payout.amount) },
        });

        failed++;
        continue;
      }

      allocationsForRollback = allocations.map((a) => ({
        theme_sale_id: a.theme_sale_id,
        amount_allocated: Number(a.amount_allocated),
      }));

      const totalAllocated = Math.round(
        allocationsForRollback.reduce((sum, a) => sum + Number(a.amount_allocated), 0) * 100
      ) / 100;
      const requestedAmount = Math.round(Number(payout.amount) * 100) / 100;

      if (Math.abs(totalAllocated - requestedAmount) > 0.00001) {
        for (const alloc of allocationsForRollback) {
          await supabaseAdmin.rpc("increment_reserved_amount", {
            sale_id: alloc.theme_sale_id,
            amount: -Number(alloc.amount_allocated),
          });
        }
        await supabaseAdmin
          .from("payout_requests")
          .update({ status: "failed", failure_reason: "Allocation total mismatch", processed_at: new Date().toISOString() })
          .eq("id", payout.id);
        failed++;
        continue;
      }

      const now = new Date().toISOString();
      const taxYear = new Date().getFullYear();
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

      // Total lifetime earnings snapshot for tax reporting
      const { data: allSales } = await supabaseAdmin
        .from("theme_sales")
        .select("creator_earnings")
        .eq("seller_id", payout.user_id)
        .in("status", ["approved", "paid"]);
      const totalEarningsSnapshot = (allSales ?? []).reduce(
        (sum, s) => sum + Number(s.creator_earnings),
        0
      );

      // Execute Stripe transfer only after allocation is fully validated.
      const transfer = await stripe.transfers.create({
        amount: Math.round(totalAllocated * 100), // cents
        currency: "usd",
        destination: profile.stripe_account_id,
        metadata: {
          payout_request_id: payout.id,
          user_id: payout.user_id,
        },
      });
      transferId = transfer.id;
      const transferReceiptUrl = (transfer as { receipt_url?: string }).receipt_url;

      // Attempt an explicit instant payout to the creator's linked debit/bank card.
      // This mirrors the wallet withdrawal flow. If the transferred funds are still in
      // pending balance (typical for standard settlements), this will fail gracefully
      // and Stripe's automatic payout schedule will route to their default card instead.
      {
        const { data: defaultPayoutCard } = await supabaseAdmin
          .from("payout_methods")
          .select("stripe_external_account_id, provider_ref")
          .eq("user_id", payout.user_id)
          .eq("status", "active")
          .eq("is_default", true)
          .maybeSingle();

        const cardDest =
          defaultPayoutCard?.stripe_external_account_id ??
          (typeof defaultPayoutCard?.provider_ref === "string" &&
          (defaultPayoutCard.provider_ref.startsWith("card_") ||
            defaultPayoutCard.provider_ref.startsWith("ba_"))
            ? defaultPayoutCard.provider_ref
            : null);

        if (cardDest) {
          try {
            await stripe.payouts.create(
              {
                amount: Math.round(totalAllocated * 100),
                currency: "usd",
                method: "instant",
                destination: cardDest,
                statement_descriptor: "1NELINK EARNINGS",
                metadata: {
                  payout_request_id: payout.id,
                  user_id: payout.user_id,
                  source: "theme_payout",
                },
              },
              { stripeAccount: profile.stripe_account_id }
            );
          } catch (payoutErr: unknown) {
            // Expected when transferred funds are still in pending balance.
            // Stripe's automatic payout schedule will route to their default card.
            console.info(
              `theme payout: instant payout to card ${cardDest} skipped for user ${payout.user_id} — auto-payout will handle:`,
              payoutErr instanceof Error ? payoutErr.message : String(payoutErr)
            );
          }
        }
      }

      for (const alloc of allocationsForRollback) {
        const { error: settleErr } = await supabaseAdmin.rpc("settle_theme_sale_allocation", {
          p_sale_id: alloc.theme_sale_id,
          p_amount: alloc.amount_allocated,
          p_paid_at: now,
        });
        if (settleErr) {
          throw new Error(`Failed to settle allocation for sale ${alloc.theme_sale_id}: ${settleErr.message}`);
        }
      }

      // Mark payout as paid — stamp receipt + tax fields
      await supabaseAdmin
        .from("payout_requests")
        .update({
          status: "paid",
          stripe_transfer_id: transfer.id,
          processed_at: now,
          paid_at: now,
          receipt_url: transferReceiptUrl ?? `${baseUrl}/receipts/${payout.id}`,
          tax_year: taxYear,
          total_earnings_snapshot: Math.round(totalEarningsSnapshot * 100) / 100,
        })
        .eq("id", payout.id);

      // Notify creator: payout completed
      void createNotification({
        userId: payout.user_id,
        type: "payout_paid",
        title: "Payout completed",
        body: `$${Number(payout.amount).toFixed(2)} has been sent to your bank account`,
        meta: { payout_id: payout.id, amount: Number(payout.amount) },
      });

      // Upsert yearly_tax_summaries — total paid-out this year
      const { data: yearPayouts } = await supabaseAdmin
        .from("payout_requests")
        .select("amount")
        .eq("user_id", payout.user_id)
        .eq("status", "paid")
        .eq("tax_year", taxYear);
      const totalPayoutsThisYear = (yearPayouts ?? []).reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      await supabaseAdmin.from("yearly_tax_summaries").upsert(
        {
          user_id: payout.user_id,
          tax_year: taxYear,
          total_earnings: Math.round(totalEarningsSnapshot * 100) / 100,
          total_payouts: Math.round(totalPayoutsThisYear * 100) / 100,
          updated_at: now,
        },
        { onConflict: "user_id,tax_year" }
      );

      processed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`payout/process: error for payout ${payout.id}:`, message);

      if (!transferId && allocationsForRollback.length > 0) {
        for (const alloc of allocationsForRollback) {
          await supabaseAdmin.rpc("increment_reserved_amount", {
            sale_id: alloc.theme_sale_id,
            amount: -Number(alloc.amount_allocated),
          });
        }
      }

      // If transfer already succeeded, never flip this payout to failed.
      if (transferId) {
        await supabaseAdmin
          .from("payout_requests")
          .update({
            status: "paid",
            stripe_transfer_id: transferId,
            failure_reason: `post_transfer_reconciliation_needed: ${message.slice(0, 160)}`,
            processed_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
          })
          .eq("id", payout.id);

        // Transfer succeeded despite post-transfer error — notify paid
        void createNotification({
          userId: payout.user_id,
          type: "payout_paid",
          title: "Payout completed",
          body: `$${Number(payout.amount).toFixed(2)} has been sent to your bank account`,
          meta: { payout_id: payout.id, amount: Number(payout.amount) },
        });

        failed++;
        continue;
      }

      await supabaseAdmin
        .from("payout_requests")
        .update({
          status: "failed",
          failure_reason: message.slice(0, 200),
          processed_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      void createNotification({
        userId: payout.user_id,
        type: "payout_failed",
        title: "Payout failed",
        body: "Something went wrong. Please retry your withdrawal.",
        meta: { payout_id: payout.id, amount: Number(payout.amount) },
      });


      failed++;
    }
  }

  return NextResponse.json({ processed, failed });
}
