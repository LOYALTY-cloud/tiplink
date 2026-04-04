import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.user.id;

  const { data } = await supabaseAdmin
    .from("payout_methods")
    .select("id, brand, last4, is_default, type, stripe_external_account_id, provider, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return NextResponse.json({ methods: data || [] });
}
