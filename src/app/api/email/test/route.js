import { NextResponse } from "next/server";

const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

export async function POST(req) {
  if (IS_PROD) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await req.json().catch(() => null);
    return NextResponse.json({ ok: false, error: "Deprecated dev-only route" }, { status: 410 });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
