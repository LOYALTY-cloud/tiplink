import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(req.url);

  const user_id = searchParams.get("user_id");
  const type = searchParams.get("type");
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 25)));
  const cursor = searchParams.get("cursor");

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

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

  return NextResponse.json({
    transactions: data ?? [],
    next_cursor: data?.length ? data[data.length - 1].created_at : null,
  });
}
