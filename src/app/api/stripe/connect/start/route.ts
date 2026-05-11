import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * DEPRECATED — redirect-based onboarding is replaced by embedded Stripe Connect.
 * Use POST /api/stripe/connect/session instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use /api/stripe/connect/session for embedded onboarding.",
      upgrade_to: "/api/stripe/connect/session",
    },
    { status: 410 },
  );
}
