import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/types/db";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STRIPE_PERCENT = 0.029;
const STRIPE_FLAT = 0.3;
const PLATFORM_PERCENT = 0.0; // platform fee disabled (0%)

function money(n: number) {
  return Math.round(n * 100); // dollars -> cents
}

export async function POST(req: Request) {
  // Dev-only mock: set DEV_MOCK_PAYMENTS=1 in your environment to bypass Stripe/Supabase
  if (process.env.DEV_MOCK_PAYMENTS === "1") {
    try {
      const body = await req.json();
      const creator_user_id = String(body.creator_user_id || "dev_user");
      const tip_amount = Number(body.tip_amount || 5);
      const receipt_id = `dev-${crypto.randomUUID()}`;

      // Construct a mock client secret that matches Stripe's expected pattern:
      // <pi id>_secret_<secret>
      // Ensure the pi id is a single alphanumeric segment (no extra underscores).
      const mockPiId = `pi_${crypto.randomUUID().split("-")[0]}`;
      const mockSecret = crypto.randomUUID().split("-")[0];
      const clientSecret = `${mockPiId}_secret_${mockSecret}`;

      return NextResponse.json({
        clientSecret,
        receiptId: receipt_id,
        breakdown: {
          tip: tip_amount,
          stripeFee: Number((tip_amount * STRIPE_PERCENT + STRIPE_FLAT).toFixed(2)),
          platformFee: Number((tip_amount * PLATFORM_PERCENT).toFixed(2)),
          total: Number((tip_amount + tip_amount * STRIPE_PERCENT + STRIPE_FLAT).toFixed(2)),
        },
      });
    } catch (e) {
      return NextResponse.json({ error: 'Mock handler error' }, { status: 500 });
    }
  }
  try {
    const body = await req.json();
    const creator_user_id = String(body.creator_user_id || "");
    const tip_amount = Number(body.tip_amount || 0);
    const note = String(body.note || "").slice(0, 200);

    if (!creator_user_id) {
      return NextResponse.json({ error: "Missing creator_user_id" }, { status: 400 });
    }
    if (!Number.isFinite(tip_amount) || tip_amount <= 0) {
      return NextResponse.json({ error: "Invalid tip_amount" }, { status: 400 });
    }

    // Fetch creator profile (need stripe_account_id for Connect destination)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, stripe_account_id, handle, display_name")
      .eq("user_id", creator_user_id)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    if (!profile.stripe_account_id) {
      // You can still allow tips if you want (platform holds funds), but for Connect transfers we need it.
      return NextResponse.json(
        { error: "Creator payouts not enabled" },
        { status: 409 }
      );
    }

    // Fees
    const stripeFee = tip_amount * STRIPE_PERCENT + STRIPE_FLAT;
    const totalCharge = tip_amount + stripeFee;
    const platformFee = tip_amount * PLATFORM_PERCENT;

    // Generate receipt id now (so we can show link instantly after payment)
    const receipt_id = crypto.randomUUID();

    // Create PaymentIntent
    const pi = await stripe.paymentIntents.create({
      amount: money(totalCharge),
      currency: "usd",
      automatic_payment_methods: { enabled: true },

      // Platform fee collected by your platform
      application_fee_amount: money(platformFee),

      // Send rest to creator connected account
      transfer_data: { destination: profile.stripe_account_id },

      metadata: {
        receipt_id,
        creator_user_id,
        tip_amount: tip_amount.toFixed(2),
        stripe_fee: stripeFee.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        note,
      },
    });

    // Optional: log an intent row for debugging / audit (if you have a table)
    await supabaseAdmin.from("tip_intents").insert({
      receipt_id,
      payment_intent_id: pi.id,
      creator_user_id,
      tip_amount,
      stripe_fee: stripeFee,
      platform_fee: platformFee,
      total_charge: totalCharge,
      note,
      status: "created",
    });

    return NextResponse.json({
      clientSecret: pi.client_secret,
      receiptId: receipt_id,
      breakdown: {
        tip: tip_amount,
        stripeFee,
        platformFee,
        total: totalCharge,
      },
    });
  } catch (e: unknown) {
    console.log("create-intent error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
