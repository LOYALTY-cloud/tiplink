import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: wallet } = await supabase.from("wallets").select("balance,currency").eq("user_id", user.id).maybeSingle();
    return NextResponse.json(wallet || { balance: 0, currency: "usd" });
  } catch (err: unknown) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
