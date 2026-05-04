import { NextResponse } from "next/server";

const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

export async function GET() {
  if (IS_PROD) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: false, error: "Deprecated dev-only route" }, { status: 410 });
}
