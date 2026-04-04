import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
  const { methodId } = await req.json();

  if (!methodId) {
    return NextResponse.json({ error: "methodId required" }, { status: 400 });
  }

  // Verify the method belongs to this user and is active
  const { data: method } = await supabaseAdmin
    .from("payout_methods")
    .select("id")
    .eq("stripe_external_account_id", methodId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!method) {
    return NextResponse.json({ error: "Method not found" }, { status: 404 });
  }

  // Reset all defaults for this user
  await supabaseAdmin
    .from("payout_methods")
    .update({ is_default: false })
    .eq("user_id", userId);

  // Set the new default
  await supabaseAdmin
    .from("payout_methods")
    .update({ is_default: true })
    .eq("id", method.id);

  return NextResponse.json({ success: true });
}
