import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_TYPES = [
  // canonical (ledger.ts)
  "tip_received",
  "tip_refunded",
  "dispute",
  "payout",
  "adjustment",
  "withdrawal",
  "deposit",
  "fee",
  "system",
  // additional / legacy
  "withdrawal_fee",
  "card_charge",
  "card_decline",
  "platform_fee",
  "tip_credit",
  "payout_debit",
  "refund",
];

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const type = searchParams.get("type");
  const limit = Math.min(Number(searchParams.get("limit") ?? 25), 100);
  const cursor = searchParams.get("cursor");

  if (type && !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "invalid transaction type" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  /* ---------- AUTH CHECK ---------- */
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: authUser } = await supabase.auth.getUser(token as any);
  if (!authUser?.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  // Always derive user_id from the authenticated session — never trust client input
  const user_id = authUser.user.id;

  /* ---------- QUERY ---------- */
  let query: any = supabase
    .from("transactions_ledger")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) query = query.eq("type", type);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const transactions = data ?? [];

  /* ---------- ENRICH TIP NOTES ---------- */
  const tipTxs = transactions.filter(
    (tx: any) => tx.type === "tip_received" && tx.reference_id
  );

  if (tipTxs.length > 0) {
    const refIds = tipTxs.map((tx: any) => tx.reference_id);
    const { data: tips } = await supabase
      .from("tips")
      .select("id, note")
      .in("id", refIds);

    if (tips?.length) {
      const noteMap = new Map(tips.map((t: any) => [t.id, t.note]));
      for (const tx of transactions) {
        if (tx.type === "tip_received" && tx.reference_id) {
          const note = noteMap.get(tx.reference_id);
          if (note) {
            tx.meta = { ...tx.meta, note };
          }
        }
      }
    }
  }

  return NextResponse.json({
    transactions,
    next_cursor: transactions.length === limit ? transactions[transactions.length - 1].created_at : null,
  });
}
