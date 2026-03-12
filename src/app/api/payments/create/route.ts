import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fee structure (UI estimate)
const STRIPE_PERCENT = 0.029;
const STRIPE_FLAT = 0.30;
const PLATFORM_PERCENT = 0.0; // platform fee disabled (0%)

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: Request) {
  try {
    const { tipAmount, creatorUserId } = await req.json();

    if (!tipAmount || tipAmount <= 0) {
      return NextResponse.json({ error: "Invalid tip amount" }, { status: 400 });
    }

    // Get creator profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", creatorUserId)
      .single();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ error: "Creator not connected" }, { status: 400 });
    }

    // Stripe processing fee (estimate)
    const stripeFee = round2(tipAmount * STRIPE_PERCENT + STRIPE_FLAT);

    const totalCharge = round2(tipAmount + stripeFee);

    const platformFee = round2(tipAmount * PLATFORM_PERCENT);

    // Generate unique receipt ID
    const receiptId = `TLM-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: toCents(totalCharge),
        currency: "usd",
        automatic_payment_methods: { enabled: true },

        // Platform fee you keep (creator pays this %)
        application_fee_amount: toCents(platformFee),

        // Destination charge → funds go to creator connected account
        transfer_data: {
          destination: profile.stripe_account_id,
        },

        metadata: {
          receipt_id: receiptId,
          tip_amount: tipAmount.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          stripe_fee_estimate: stripeFee.toFixed(2),
          creator_id: creatorUserId,
        },
      },
      {
        // Prevent duplicates if user double clicks
        idempotencyKey: `pi_tip_${creatorUserId}_${receiptId}`,
      }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      receiptId,
      breakdown: {
        tip: tipAmount,
        stripeFee,
        total: totalCharge,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
