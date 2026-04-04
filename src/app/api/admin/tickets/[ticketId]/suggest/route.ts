import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { generateReplySuggestions } from "@/lib/support/ticketAI";

export const runtime = "nodejs";

/**
 * GET /api/admin/tickets/[ticketId]/suggest
 * Returns AI-generated reply suggestions for the admin.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketId } = await params;

  const suggestions = await generateReplySuggestions(ticketId);

  return NextResponse.json({ suggestions });
}
