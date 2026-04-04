import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { logCaughtError } from "@/lib/errorLogger";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fee structure — must match src/lib/fees.ts
import { STRIPE_PERCENT, STRIPE_FLAT, PLATFORM_PERCENT } from "@/lib/fees";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: Request) {
  try {
    // Rate limit: 10 payments per minute per IP
    const ip = getClientIp(req);
    const { allowed } = await rateLimit(`payment:${ip}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const body = await req.json();
    const tipAmount = Number(body.tipAmount);
    const creatorUserId = String(body.creatorUserId || "");
    const supporter_user_id = body.supporter_user_id ? String(body.supporter_user_id) : null;
    const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const supporter_ip = ipHeader.split(",")[0].trim();

    if (!tipAmount || tipAmount <= 0) {
      return NextResponse.json({ error: "Invalid tip amount" }, { status: 400 });
    }

    // Min/max
    if (tipAmount < 1) return NextResponse.json({ error: "Minimum tip is $1" }, { status: 400 });
    if (tipAmount > 500) return NextResponse.json({ error: "Maximum tip is $500" }, { status: 400 });

    // Daily limit (user / ip)
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      if (supporter_user_id) {
        const { data: rows } = await supabaseAdmin
          .from("transactions_ledger")
          .select("amount")
          .eq("user_id", supporter_user_id)
          .eq("type", "tip_sent")
          .gte("created_at", startOfDay.toISOString());
        const dailyTotal = (rows || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        if (dailyTotal + tipAmount > 2000) {
          await supabaseAdmin.from("fraud_events").insert({ user_id: supporter_user_id, ip: supporter_ip, type: "daily_limit", reason: "daily tipping limit reached" });
          return NextResponse.json({ error: "Daily tipping limit reached" }, { status: 429 });
        }
      } else if (supporter_ip) {
        const { data: rows } = await supabaseAdmin
          .from("tip_intents")
          .select("tip_amount")
          .eq("supporter_ip", supporter_ip)
          .gte("created_at", startOfDay.toISOString());
        const dailyTotal = (rows || []).reduce((s: number, r: any) => s + Number(r.tip_amount || 0), 0);
        if (dailyTotal + tipAmount > 2000) {
          await supabaseAdmin.from("fraud_events").insert({ user_id: null, ip: supporter_ip, type: "daily_limit", reason: "daily tipping limit reached (ip)" });
          return NextResponse.json({ error: "Daily tipping limit reached" }, { status: 429 });
        }
      }
    } catch (e) {
      console.warn("daily limit check failed", e);
    }

    // Rate limit
    try {
      const since60s = new Date(Date.now() - 60 * 1000).toISOString();
      let recentCount = 0;
      if (supporter_user_id) {
        const { count } = await supabaseAdmin.from("tip_intents").select("receipt_id", { count: "exact" }).eq("supporter_user_id", supporter_user_id).gt("created_at", since60s);
        recentCount = count ?? 0;
      } else if (supporter_ip) {
        const { count } = await supabaseAdmin.from("tip_intents").select("receipt_id", { count: "exact" }).eq("supporter_ip", supporter_ip).gt("created_at", since60s);
        recentCount = count ?? 0;
      }
      if (recentCount > 5) {
        await supabaseAdmin.from("fraud_events").insert({ user_id: supporter_user_id, ip: supporter_ip, type: "rate_limit", reason: "too many tips per minute" });
        return NextResponse.json({ error: "Too many tips. Please wait a moment." }, { status: 429 });
      }
    } catch (e) {
      console.warn("rate limit check failed", e);
    }

    // Chargeback
    try {
      if (supporter_user_id) {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin.from("transactions_ledger").select("id", { count: "exact" }).eq("user_id", supporter_user_id).eq("type", "tip_refunded").gt("created_at", since30d);
        if ((count ?? 0) >= 3) {
          await supabaseAdmin.from("fraud_events").insert({ user_id: supporter_user_id, ip: supporter_ip, type: "chargeback_risk", reason: "multiple recent refunds" });
          return NextResponse.json({ error: "Tipping temporarily disabled" }, { status: 429 });
        }
      }
    } catch (e) {
      console.warn("chargeback check failed", e);
    }

    // Card testing
    try {
      if (supporter_ip) {
        const since5m = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin.from("tip_intents").select("receipt_id", { count: "exact" }).eq("supporter_ip", supporter_ip).lt("tip_amount", 2).gt("created_at", since5m);
        if ((count ?? 0) > 10) {
          await supabaseAdmin.from("fraud_events").insert({ user_id: null, ip: supporter_ip, type: "card_testing", reason: "high small-amount attempts" });
          return NextResponse.json({ error: "Too many payment attempts from your IP" }, { status: 429 });
        }
      }
    } catch (e) {
      console.warn("card testing check failed", e);
    }

    // Get creator profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_charges_enabled, account_status")
      .eq("user_id", creatorUserId)
      .single();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ error: "Creator not connected" }, { status: 400 });
    }
    if (!profile.stripe_charges_enabled) {
      return NextResponse.json({ error: "Creator charges not enabled" }, { status: 409 });
    }

    // Enforce account status: only active creators can receive tips
    if (profile.account_status && profile.account_status !== "active") {
      return NextResponse.json({ error: "Creator not accepting payments" }, { status: 403 });
    }

    // Stripe processing fee (estimate)
    const stripeFee = round2(tipAmount * STRIPE_PERCENT + STRIPE_FLAT);

    const totalCharge = round2(tipAmount + stripeFee);

    const platformFee = round2(tipAmount * PLATFORM_PERCENT);

    // Generate unique receipt ID
    const receiptId = `TLM-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

    // Insert tip_intents row before calling Stripe so we can use DB id for idempotency
    const { data: intentRow, error: intentErr } = await supabaseAdmin
      .from("tip_intents")
      .insert({
        creator_user_id: creatorUserId,
        amount: tipAmount,
        receipt_id: receiptId,
        status: "pending",
        supporter_user_id: supporter_user_id,
        supporter_ip: supporter_ip || null,
      })
      .select()
      .single();

    if (intentErr || !intentRow) {
      return NextResponse.json({ error: "Failed to create tip intent" }, { status: 500 });
    }

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
        // Ensure correct dispute routing and compliance
        on_behalf_of: profile.stripe_account_id,

        metadata: {
          receipt_id: receiptId,
          tip_amount: tipAmount.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          stripe_fee_estimate: stripeFee.toFixed(2),
          creator_id: creatorUserId,
        },
      },
      {
        // Use DB idempotency key derived from tip_intents primary key
        idempotencyKey: `tip-${intentRow.receipt_id}`,
      }
    );

    // Update tip_intents row with Stripe payment intent id and mark created
    await supabaseAdmin
      .from("tip_intents")
      .update({ stripe_payment_intent_id: paymentIntent.id, status: "created" })
      .eq("receipt_id", intentRow.receipt_id);

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
    logCaughtError("api/payments/create", err);
    const errMsg = err instanceof Error ? err.message : String(err ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
