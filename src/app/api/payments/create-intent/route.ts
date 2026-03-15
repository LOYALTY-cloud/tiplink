import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/types/db";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";


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
    const supporter_user_id = body.supporter_user_id ? String(body.supporter_user_id) : null;
    const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const supporter_ip = ipHeader.split(",")[0].trim();

    if (!creator_user_id) {
      return NextResponse.json({ error: "Missing creator_user_id" }, { status: 400 });
    }
    if (!Number.isFinite(tip_amount) || tip_amount <= 0) {
      return NextResponse.json({ error: "Invalid tip_amount" }, { status: 400 });
    }

    // Fraud protections
    // 1) Min / Max tip
    if (tip_amount < 1) {
      return NextResponse.json({ error: "Minimum tip is $1" }, { status: 400 });
    }
    if (tip_amount > 500) {
      return NextResponse.json({ error: "Maximum tip is $500" }, { status: 400 });
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // 2) Daily tipping limit per supporter (use user id when available, else IP-based heuristic)
    try {
      if (supporter_user_id) {
        const { data: rows } = await supabaseAdmin
          .from("transactions_ledger")
          .select("amount")
          .eq("user_id", supporter_user_id)
          .eq("type", "tip_sent")
          .gte("created_at", startOfDay.toISOString());

        const dailyTotal = (rows || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        if (dailyTotal + tip_amount > 2000) {
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
        if (dailyTotal + tip_amount > 2000) {
          await supabaseAdmin.from("fraud_events").insert({ user_id: null, ip: supporter_ip, type: "daily_limit", reason: "daily tipping limit reached (ip)" });
          return NextResponse.json({ error: "Daily tipping limit reached" }, { status: 429 });
        }
      }
    } catch (e) {
      console.warn("daily limit check failed", e);
    }

    // 3) Rate limit: max 5 tips per minute
    try {
      const since60s = new Date(Date.now() - 60 * 1000).toISOString();
      let recentCount = 0;
      if (supporter_user_id) {
        const { count } = await supabaseAdmin
          .from("tip_intents")
          .select("id", { count: "exact" })
          .eq("supporter_user_id", supporter_user_id)
          .gt("created_at", since60s);
        recentCount = count ?? 0;
      } else if (supporter_ip) {
        const { count } = await supabaseAdmin
          .from("tip_intents")
          .select("id", { count: "exact" })
          .eq("supporter_ip", supporter_ip)
          .gt("created_at", since60s);
        recentCount = count ?? 0;
      }
      if (recentCount > 5) {
        await supabaseAdmin.from("fraud_events").insert({ user_id: supporter_user_id, ip: supporter_ip, type: "rate_limit", reason: "too many tips per minute" });
        return NextResponse.json({ error: "Too many tips. Please wait a moment." }, { status: 429 });
      }
    } catch (e) {
      console.warn("rate limit check failed", e);
    }

    // 4) Chargeback risk: if supporter has >3 refunds in 30 days, block
    try {
      if (supporter_user_id) {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("transactions_ledger")
          .select("id", { count: "exact" })
          .eq("user_id", supporter_user_id)
          .eq("type", "tip_refunded")
          .gt("created_at", since30d);
        if ((count ?? 0) >= 3) {
          await supabaseAdmin.from("fraud_events").insert({ user_id: supporter_user_id, ip: supporter_ip, type: "chargeback_risk", reason: "multiple recent refunds" });
          return NextResponse.json({ error: "Tipping temporarily disabled" }, { status: 429 });
        }
      }
    } catch (e) {
      console.warn("chargeback check failed", e);
    }

    // 5) Card testing detection (many small attempts from same IP)
    try {
      if (supporter_ip) {
        const since5m = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("tip_intents")
          .select("id", { count: "exact" })
          .eq("supporter_ip", supporter_ip)
          .lt("tip_amount", 2)
          .gt("created_at", since5m);
        if ((count ?? 0) > 10) {
          await supabaseAdmin.from("fraud_events").insert({ user_id: null, ip: supporter_ip, type: "card_testing", reason: "high small-amount attempts" });
          return NextResponse.json({ error: "Too many payment attempts from your IP" }, { status: 429 });
        }
      }
    } catch (e) {
      console.warn("card testing check failed", e);
    }

    // Fetch creator profile (need stripe_account_id for Connect destination)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, stripe_account_id, handle, display_name, stripe_charges_enabled")
      .eq("user_id", creator_user_id)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    if (!profile.stripe_account_id) {
      return NextResponse.json({ error: "Creator payouts not enabled" }, { status: 409 });
    }
    if (!profile.stripe_charges_enabled) {
      return NextResponse.json({ error: "Creator charges not enabled" }, { status: 409 });
    }

    // Fees
    const stripeFee = tip_amount * STRIPE_PERCENT + STRIPE_FLAT;
    const totalCharge = tip_amount + stripeFee;
    const platformFee = tip_amount * PLATFORM_PERCENT;

    // Generate receipt id now (so we can show link instantly after payment)
    const receipt_id = crypto.randomUUID();

    // Insert a tip_intents row BEFORE calling Stripe so we can use the DB id
    // as a stable idempotency key. This guarantees one Stripe charge per DB row.
    const { data: intentRow, error: intentErr } = await supabaseAdmin
      .from("tip_intents")
      .insert({
        creator_user_id,
        tip_amount: tip_amount,
        receipt_id,
        note,
        status: "pending",
        supporter_user_id: supporter_user_id,
        supporter_ip: supporter_ip || null,
      })
      .select()
      .single();

    if (intentErr || !intentRow) {
      return NextResponse.json({ error: "Failed to create tip intent" }, { status: 500 });
    }

    // Create PaymentIntent (use idempotency key derived from DB id)
    const stripe = getStripe();

    const pi = await stripe.paymentIntents.create(
      {
        amount: money(totalCharge),
        currency: "usd",
        automatic_payment_methods: { enabled: true },

        // Platform fee collected by your platform
        application_fee_amount: money(platformFee),
        // Destination charge → funds go to creator connected account
        transfer_data: {
          destination: profile.stripe_account_id,
        },
        // Ensure correct dispute routing and tax/reporting
        on_behalf_of: profile.stripe_account_id,

        metadata: {
          receipt_id,
          creator_user_id,
          tip_amount: tip_amount.toFixed(2),
          stripe_fee: stripeFee.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          note,
        },
      },
      {
        idempotencyKey: `tip-${intentRow.id}`,
      }
    );

    // Update tip_intents row with Stripe PaymentIntent id and mark created
    await supabaseAdmin
      .from("tip_intents")
      .update({ stripe_payment_intent_id: pi.id, status: "created" })
      .eq("id", intentRow.id);

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
