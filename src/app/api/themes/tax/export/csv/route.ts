import { NextRequest, NextResponse } from "next/server";
import { buildTaxPayload } from "../../lib";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/themes/tax/export/csv?year=2026
 * Streams a CSV file containing all approved/paid sales and payout records for the year.
 */
export async function GET(req: NextRequest) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const rawYear = req.nextUrl.searchParams.get("year");
  const year = rawYear ? parseInt(rawYear, 10) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return new Response("Invalid year", { status: 400 });
  }

  try {
    const data = await buildTaxPayload(userId, year);

    const lines: string[] = [
      // Metadata header block
      `TipLink Creator Tax Summary,${year}`,
      `Creator,${JSON.stringify(data.creatorName)}`,
      `Generated,${new Date(data.generatedAt).toISOString()}`,
      `Total Earnings,$${data.total_earnings.toFixed(2)}`,
      `Total Payouts,$${data.total_payouts.toFixed(2)}`,
      "",
      // Sales section
      "THEME SALES",
      "Date,Sale ID,Status,Creator Earnings",
      ...data.sales.map(
        (s) =>
          `${new Date(s.created_at).toISOString().slice(0, 10)},${s.id},${s.status},$${Number(s.creator_earnings).toFixed(2)}`
      ),
      "",
      // Payouts section
      "PAYOUTS",
      "Date,Payout ID,Status,Amount,Stripe Transfer ID,Receipt URL",
      ...data.payouts.map(
        (p) =>
          [
            p.processed_at ? new Date(p.processed_at).toISOString().slice(0, 10) : "",
            p.id,
            p.status,
            `$${Number(p.amount).toFixed(2)}`,
            p.stripe_transfer_id ?? "",
            p.receipt_url ?? "",
          ].join(",")
      ),
      "",
      "DISCLAIMER",
      '"This document is for informational purposes only. It is NOT an official IRS tax form. Consult a qualified tax professional."',
    ];

    const csv = lines.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tiplink_tax_${year}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("tax/export/csv: error", err);
    return new Response("Failed to generate CSV", { status: 500 });
  }
}
