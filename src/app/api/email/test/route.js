import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  try {
    const body = await req.json();
    const to = String(body?.to || "").trim().toLowerCase();

    if (!to) {
      return NextResponse.json({ error: "Missing to" }, { status: 400 });
    }

    const from = process.env.RECEIPTS_FROM_EMAIL;
    if (!from) {
      return NextResponse.json(
        { error: "Missing RECEIPTS_FROM_EMAIL" },
        { status: 500 }
      );
    }

    const resendResponse = await resend.emails.send({
      from,
      to,
      subject: "Test from 1neLink",
      html: "<p>Hello world</p>",
    });

    return NextResponse.json({ ok: true, resendResponse });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
