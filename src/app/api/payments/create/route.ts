import { NextResponse } from "next/server";

/**
 * DEPRECATED — This endpoint has been replaced by /api/payments/create-intent.
 * Retained as a stub so old clients get a clear error instead of a 404.
 */
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has been deprecated. Use /api/payments/create-intent." },
    { status: 410 }
  );
}
