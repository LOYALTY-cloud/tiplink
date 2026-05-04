import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { TaxReport } from "@/lib/pdf/TaxReport";
import { buildTaxPayload } from "../../lib";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

/**
 * GET /api/themes/tax/export/pdf?year=2026
 * Renders a PDF tax summary using @react-pdf/renderer and streams it as a download.
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

    const buffer = await renderToBuffer(
      React.createElement(TaxReport, { data }) as never
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tiplink_tax_${year}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("tax/export/pdf: error", err);
    return new Response("Failed to generate PDF", { status: 500 });
  }
}
