import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncStripeAccount } from "@/lib/stripe/syncAccount";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Authenticate caller
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { createClient: createAnonClient } = await import("@supabase/supabase-js");
    const supabaseUser = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user_id = authRes.user.id;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", user_id)
      .maybeSingle()
      .returns<import("@/types/db").ProfileRow | null>();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ payouts_enabled: false, reason: "no_account" });
    }

    const result = await syncStripeAccount(profile.stripe_account_id, { eventType: "manual_sync" });

    if (!result.success) {
      console.log("stripe connect sync error:", result.error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    return NextResponse.json({
      payouts_enabled: result.restrictionLevel === "healthy",
      restriction_level: result.restrictionLevel,
      verification_status: result.verificationStatus,
    });
  } catch (e: unknown) {
    console.log("stripe connect sync error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
