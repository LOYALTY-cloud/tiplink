import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

type ThemeSaleRow = {
  seller_id: string;
  creator_earnings: number | string | null;
  reserved_amount: number | string | null;
  paid_out_amount: number | string | null;
  status: "pending" | "approved" | "paid" | "canceled" | string;
};

type PayoutRequestRow = {
  id: string;
  user_id: string;
  amount: number | string | null;
  status: "pending" | "processing" | "paid" | "failed" | string;
  created_at: string;
};

function n(value: number | string | null | undefined): number {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin", "finance_admin"]);

    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id")?.trim() || null;
    const stuckMinutesRaw = Number(url.searchParams.get("stuck_minutes") ?? "60");
    const stuckMinutes = Number.isFinite(stuckMinutesRaw) && stuckMinutesRaw > 0
      ? Math.floor(stuckMinutesRaw)
      : 60;
    const stuckBefore = new Date(Date.now() - stuckMinutes * 60_000).toISOString();

    let salesQuery = supabaseAdmin
      .from("theme_sales")
      .select("seller_id, creator_earnings, reserved_amount, paid_out_amount, status");
    if (userId) salesQuery = salesQuery.eq("seller_id", userId);

    let payoutsQuery = supabaseAdmin
      .from("payout_requests")
      .select("id, user_id, amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (userId) payoutsQuery = payoutsQuery.eq("user_id", userId);

    const [{ data: sales, error: salesErr }, { data: payouts, error: payoutsErr }] = await Promise.all([
      salesQuery,
      payoutsQuery,
    ]);

    if (salesErr) {
      return NextResponse.json({ error: `Failed to load theme sales: ${salesErr.message}` }, { status: 500 });
    }
    if (payoutsErr) {
      return NextResponse.json({ error: `Failed to load payout requests: ${payoutsErr.message}` }, { status: 500 });
    }

    const salesRows = (sales ?? []) as ThemeSaleRow[];
    const payoutRows = (payouts ?? []) as PayoutRequestRow[];

    const byStatus = {
      pending: 0,
      approved: 0,
      paid: 0,
      canceled: 0,
    };

    let pendingAmount = 0;
    let approvedAmount = 0;
    let paidAmount = 0;
    let reservedOnSales = 0;
    let availableFromSales = 0;

    for (const row of salesRows) {
      if (row.status === "pending") {
        byStatus.pending += 1;
        pendingAmount += n(row.creator_earnings);
      } else if (row.status === "approved") {
        byStatus.approved += 1;
        approvedAmount += n(row.creator_earnings);
        reservedOnSales += n(row.reserved_amount);
        availableFromSales += Math.max(0, n(row.creator_earnings) - n(row.paid_out_amount) - n(row.reserved_amount));
      } else if (row.status === "paid") {
        byStatus.paid += 1;
        paidAmount += n(row.creator_earnings);
      } else if (row.status === "canceled") {
        byStatus.canceled += 1;
      }
    }

    const payoutsByStatus = {
      pending: 0,
      processing: 0,
      paid: 0,
      failed: 0,
    };

    const stuckProcessing = payoutRows
      .filter((r) => r.status === "processing" && r.created_at < stuckBefore)
      .map((r) => ({
        id: r.id,
        user_id: r.user_id,
        amount: Math.round(n(r.amount) * 100) / 100,
        created_at: r.created_at,
      }));

    for (const row of payoutRows) {
      if (row.status === "pending") {
        payoutsByStatus.pending += 1;
      } else if (row.status === "processing") {
        payoutsByStatus.processing += 1;
      } else if (row.status === "paid") {
        payoutsByStatus.paid += 1;
      } else if (row.status === "failed") {
        payoutsByStatus.failed += 1;
      }
    }

    return NextResponse.json({
      scope: userId ? "user" : "global",
      user_id: userId,
      stuck_threshold_minutes: stuckMinutes,
      earnings: {
        pending_amount: Math.round(pendingAmount * 100) / 100,
        approved_amount: Math.round(approvedAmount * 100) / 100,
        paid_amount: Math.round(paidAmount * 100) / 100,
        reserved_on_sales: Math.round(reservedOnSales * 100) / 100,
        available_now: Math.round(availableFromSales * 100) / 100,
      },
      sales_counts: byStatus,
      payout_request_counts: payoutsByStatus,
      stuck_processing_count: stuckProcessing.length,
      stuck_processing: stuckProcessing,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
