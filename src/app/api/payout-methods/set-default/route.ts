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
  let payout_method_id: string | undefined;
  try {
    const body = await req.json();
    payout_method_id = body.payout_method_id;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!payout_method_id) {
    return NextResponse.json({ error: "payout_method_id required" }, { status: 400 });
  }

  // Verify the method belongs to this user and is active
  const { data: method } = await supabaseAdmin
    .from("payout_methods")
    .select("id, provider, provider_ref, stripe_external_account_id")
    .eq("id", payout_method_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!method) {
    return NextResponse.json({ error: "Method not found" }, { status: 404 });
  }

  // If this is a Stripe Connect external account, update Stripe's default too
  if (method.provider === "stripe_connect") {
    const extId = method.stripe_external_account_id || method.provider_ref;
    if (extId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_account_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (profile?.stripe_account_id) {
        try {
          await stripe.accounts.updateExternalAccount(
            profile.stripe_account_id,
            extId,
            { default_for_currency: true }
          );
        } catch (err) {
          console.error("[set-default] Stripe sync failed:", err instanceof Error ? err.message : err);
          return NextResponse.json({ error: "Failed to update default on Stripe" }, { status: 500 });
        }
      }
    }
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
