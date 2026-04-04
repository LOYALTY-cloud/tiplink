import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/payments/status?receiptId=<uuid>
 * Lightweight polling endpoint for post-payment / post-3DS status checks.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const receiptId = searchParams.get("receiptId");

  if (!receiptId || typeof receiptId !== "string") {
    return NextResponse.json({ error: "Missing receiptId" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tip_intents")
    .select("status, failure_reason")
    .eq("receipt_id", receiptId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ status: "unknown" });
  }

  return NextResponse.json({
    status: data.status,
    failure_reason: data.status === "failed" ? data.failure_reason : undefined,
  });
}
