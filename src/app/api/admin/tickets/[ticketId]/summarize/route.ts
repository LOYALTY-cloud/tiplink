import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { generateTicketSummary } from "@/lib/support/ticketAI";

export const runtime = "nodejs";

/**
 * POST /api/admin/tickets/[ticketId]/summarize
 * Manually trigger AI summary generation for a ticket.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketId } = await params;

  const result = await generateTicketSummary(ticketId);

  if (!result) {
    return NextResponse.json(
      { error: "Could not generate summary (already exists or ticket not found)" },
      { status: 422 }
    );
  }

  return NextResponse.json({ summary: result });
}
