import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  // Read Supabase JWT from Authorization header
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  // Validate user via anon client + JWT
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );

  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = userRes.user.id;

  const { data: prof, error } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_enabled, stripe_onboarding_complete")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const connected = !!prof?.stripe_account_id;
  const payoutsEnabled = !!prof?.stripe_payouts_enabled;

  return NextResponse.json({
    connected,
    payoutsEnabled,
    onboardingComplete: !!prof?.stripe_onboarding_complete,
  });
}
