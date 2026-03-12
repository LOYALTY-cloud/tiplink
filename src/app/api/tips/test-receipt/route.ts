import { NextResponse } from "next/server";
import { sendTipReceiptEmail } from "@/lib/email/sendReceipt";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await req.json();

    const to = (body.to as string | undefined)?.trim().toLowerCase();
    const amount = (body.amount as string | undefined) ?? "$10.00";
    const creatorName = (body.creatorName as string | undefined) ?? "Creator";
    const createdAt =
      (body.createdAt as string | undefined) ?? new Date().toLocaleString();
    const receiptId =
      (body.receiptId as string | undefined) ??
      `TL-TEST-${Date.now().toString(36).toUpperCase()}`;

    if (!to) {
      return NextResponse.json({ error: "Missing to" }, { status: 400 });
    }

    const resendResponse = await sendTipReceiptEmail({
      to,
      receiptId,
      amount,
      creatorName,
      createdAt,
    });

    return NextResponse.json({ ok: true, resendResponse });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
