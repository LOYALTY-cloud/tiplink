import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

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
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const methodId = body.payout_method_id || body.methodId;

  if (!methodId || typeof methodId !== "string") {
    return NextResponse.json({ error: "payout_method_id required" }, { status: 400 });
  }

  // Look up the method to verify ownership
  const { data: method } = await supabaseAdmin
    .from("payout_methods")
    .select("id, user_id, stripe_external_account_id, provider")
    .eq("id", methodId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!method) {
    return NextResponse.json({ error: "Method not found" }, { status: 404 });
  }

  // If this is a Connect external account, remove from Stripe first
  if (method.provider === "stripe_connect" && method.stripe_external_account_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.stripe_account_id) {
      try {
        await stripe.accounts.deleteExternalAccount(
          profile.stripe_account_id,
          method.stripe_external_account_id
        );
      } catch (err: any) {
        // If Stripe says it doesn't exist, still clean up DB
        if (err?.code !== "resource_missing") {
          return NextResponse.json({ error: "Failed to remove from Stripe" }, { status: 500 });
        }
      }
    }
  }

  // Update DB — soft delete
  await supabaseAdmin
    .from("payout_methods")
    .update({ status: "removed", is_default: false })
    .eq("id", method.id);

  return NextResponse.json({ success: true });
}
