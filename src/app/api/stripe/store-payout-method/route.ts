import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  // Lazily initialize inside handler so env vars are available at runtime
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Authenticate caller
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
  const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = authRes.user.id;

  let token: string | undefined;
  try {
    const body = await req.json();
    token = body.token; // tok_xxx from stripe.createToken()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!token || !token.startsWith("tok_")) {
    return NextResponse.json(
      { error: "Invalid token format. Must be tok_xxx from Stripe.js." },
      { status: 400 }
    );
  }

  // Enforce 2-card limit
  const { count } = await supabaseAdmin
    .from("payout_methods")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");

  if ((count ?? 0) >= 2) {
    return NextResponse.json({ error: "Maximum of 2 payout methods allowed" }, { status: 400 });
  }

  // Fetch user's Stripe Connect account ID
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.stripe_account_id) {
    return NextResponse.json(
      { error: "Stripe account not set up. Complete onboarding first." },
      { status: 400 }
    );
  }

  const stripeAccountId = profile.stripe_account_id;

  // Attach the token to the connected account as an external account
  // This converts tok_xxx into card_xxx bound to the connected account
  let externalAccount: any;
  try {
    externalAccount = await stripe.accounts.createExternalAccount(
      stripeAccountId,
      {
        external_account: token,
      }
    );
  } catch (err: any) {
    console.error("stripe/store-payout-method: createExternalAccount failed", err);
    // Surface the actual Stripe error message so users get actionable feedback
    // (e.g. "This card does not support payouts", "Must be a debit card", etc.)
    const stripeMessage: string | undefined = err?.raw?.message ?? err?.message;
    const userMessage =
      stripeMessage && stripeMessage.length < 300
        ? stripeMessage
        : "Could not link card to payout account. Please ensure you are using a debit card and try again.";
    return NextResponse.json({ error: userMessage }, { status: 400 });
  }

  const cardId = externalAccount.id; // card_xxx
  const brand = externalAccount?.brand ?? null;
  const last4 = externalAccount?.last4 ?? null;

  // Mark other methods as not default
  await supabaseAdmin
    .from("payout_methods")
    .update({ is_default: false })
    .eq("user_id", userId);

  // Store the external account reference in our database
  const { error } = await supabaseAdmin.from("payout_methods").insert({
    user_id: userId,
    provider: "stripe_connect",
    provider_ref: cardId, // card_xxx
    stripe_external_account_id: cardId, // Redundant but helps with queries
    type: "debit",
    brand,
    last4,
    is_default: true,
    status: "active",
  });

  if (error) {
    console.error("stripe/store-payout-method: db insert failed", error);
    return NextResponse.json({ error: "Failed to save payout method" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, brand, last4 });
}
