import { NextResponse } from "next/server";
import { Resend } from "resend";

const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

export async function GET() {
  if (IS_PROD) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const key = process.env.RESEND_API_KEY || "";
  return NextResponse.json({
    hasKey: !!key,
    keyStartsWith: key.slice(0, 3),
    keyLength: key.length,
    from: process.env.RECEIPTS_FROM_EMAIL || null,
  });
}

export async function POST(req: Request) {
  if (IS_PROD) return NextResponse.json({ error: "Not available" }, { status: 404 });
  try {
    const { to } = await req.json();
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RECEIPTS_FROM_EMAIL;
    if (!apiKey || !from) {
      return NextResponse.json({ ok: false, error: "RESEND_API_KEY or RECEIPTS_FROM_EMAIL not configured" }, { status: 500 });
    }
    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from,
      to,
      subject: "1NELINK receipts test ✅",
      html: "<p>If you got this, Resend API key is valid.</p>",
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    console.error("debug/resend", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
