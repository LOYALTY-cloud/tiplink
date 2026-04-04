import { NextResponse } from "next/server";
import { sendTipReceipt } from "@/lib/email/sendTipReceipt";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await req.json();

    const to = (body.to as string | undefined)?.trim().toLowerCase();
    const amountUsd = (body.amount as string | undefined) ?? "$10.00";
    const creatorName = (body.creatorName as string | undefined) ?? "Creator";
    const createdAt =
      (body.createdAt as string | undefined) ?? new Date().toLocaleString();
    const receiptId =
      (body.receiptId as string | undefined) ??
      `TL-TEST-${Date.now().toString(36).toUpperCase()}`;

    if (!to) {
      return NextResponse.json({ error: "Missing to" }, { status: 400 });
    }

    const resendResponse = await sendTipReceipt({
      to,
      receiptId,
      amountUsd,
      creatorName,
      createdAt,
    });

    return NextResponse.json({ ok: true, resendResponse });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
