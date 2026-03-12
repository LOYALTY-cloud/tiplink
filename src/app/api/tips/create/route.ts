import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTipReceipt } from "@/lib/email/sendTipReceipt";
import { addLedgerEntry } from "@/lib/ledger";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function receiptId() {
  return `TLM-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

export async function POST(req: Request) {
  try {
    const { receiver_user_id, amount, tipper_name, receipt_email, note } =
      await req.json();

    const amt = Number(amount);
    if (!receiver_user_id || !Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const rid = receiptId();
    const platform_fee = 0;
    const net = Math.max(0, amt - platform_fee);

    const { data: tip, error } = await supabaseAdmin
      .from("tips")
      .insert({
        receiver_user_id,
        tipper_name: tipper_name ?? null,
        receipt_email: receipt_email?.trim().toLowerCase() ?? null,
        receipt_id: rid,
        amount: Number(amt.toFixed(2)),
        platform_fee: Number(platform_fee.toFixed(2)),
        net: Number(net.toFixed(2)),
        note: note ?? null,
        status: "succeeded",
      })
      .select("id, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Log tip credit to ledger (credit to receiver)
    try {
      await addLedgerEntry({
        user_id: receiver_user_id,
        type: "tip",
        amount: Number(net.toFixed(2)),
        reference_id: tip.id,
        metadata: { tipper_name: tipper_name ?? null, receipt_email: receipt_email?.trim().toLowerCase() ?? null },
      });
    } catch (err: unknown) {
      // Attempt to rollback tip row to avoid inconsistent state
      try { await supabaseAdmin.from("tips").delete().eq("id", tip.id); } catch (e) {}
      return NextResponse.json({ error: "Failed to log ledger entry" }, { status: 500 });
    }
    if (receipt_email) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("handle, display_name")
        .eq("user_id", receiver_user_id)
        .maybeSingle();

      const creatorName = prof?.display_name || prof?.handle || "Creator";
      const createdAt = new Date(tip.created_at).toLocaleString();

      await sendTipReceipt({
        to: receipt_email.trim().toLowerCase(),
        receiptId: rid,
        amountUsd: money(amt),
        creatorName,
        createdAt,
      });

      await supabaseAdmin
        .from("tips")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", tip.id);
    }

    return NextResponse.json({ ok: true, id: tip.id, receipt_id: rid });
  } catch (e: unknown) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
