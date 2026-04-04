import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await params;

    const { data } = await supabaseAdmin
      .from("transactions_ledger")
      .select("id, type, amount, reference_id, status, meta, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ transactions: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
