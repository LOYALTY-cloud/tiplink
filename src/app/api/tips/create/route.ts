import { NextResponse } from "next/server";

/**
 * DISABLED — This route credited wallets without verifying Stripe payment.
 * All tip payments must go through /api/payments/create-intent → Stripe webhook.
 * Kept as a stub to return 410 Gone on any lingering client references.
 */
export async function POST(_req: Request) {
  return NextResponse.json(
    { error: "This endpoint has been deprecated. Use /api/payments/create-intent." },
    { status: 410 }
  );
}
