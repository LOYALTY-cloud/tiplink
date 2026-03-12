import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET() {
  const key = process.env.RESEND_API_KEY || "";
  return NextResponse.json({
    hasKey: !!key,
    keyStartsWith: key.slice(0, 3),
    keyLength: key.length,
    from: process.env.RECEIPTS_FROM_EMAIL || null,
  });
}

export async function POST(req: Request) {
  try {
    const { to } = await req.json();
    const resend = new Resend(process.env.RESEND_API_KEY!);

    const result = await resend.emails.send({
      from: process.env.RECEIPTS_FROM_EMAIL!,
      to,
      subject: "TIPLINKME receipts test ✅",
      html: "<p>If you got this, Resend API key is valid.</p>",
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
