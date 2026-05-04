import { NextRequest, NextResponse } from "next/server";
import { buildTaxPayload } from "../lib";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/themes/tax/export?year=2026
 * Returns JSON tax summary + full sales/payout records for the given year.
 */
export async function GET(req: NextRequest) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  const rawYear = req.nextUrl.searchParams.get("year");
  const year = rawYear ? parseInt(rawYear, 10) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    const data = await buildTaxPayload(userId, year);
    return NextResponse.json(data);
  } catch (err) {
    console.error("tax/export: error", err);
    return NextResponse.json({ error: "Failed to build tax export" }, { status: 500 });
  }
}
