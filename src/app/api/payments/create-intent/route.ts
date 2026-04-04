import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/types/db";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

import { STRIPE_PERCENT, STRIPE_FLAT, PLATFORM_PERCENT, calculateTipFees } from "@/lib/fees";
import { analyzeTransaction } from "@/lib/fraudEngine";
import { runFraudCheck, humanizeFlags } from "@/lib/fraudOrchestrator";
import { createRiskAlert } from "@/lib/riskAlerts";
import { notifyAdmins, createNotification } from "@/lib/notifications";

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
    const supporter_name = body.supporter_name ? String(body.supporter_name).trim().slice(0, 100) : null;
    const message = body.message ? String(body.message).trim().slice(0, 200) : null;
    const is_anonymous = body.is_anonymous !== false;
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
    // 6) Hybrid fraud scoring — Rules + Behavior + AI
    const since15m = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    let recentEvents: { tip_amount: number; supporter_ip: string | null; created_at: string }[] = [];
    let accountAgeHours = Infinity;
    let currentRiskScore = 0;
    let previousRestrictions = 0;
    let isVerified = false;

    try {
      // Fetch recent tip events for behavior analysis
      const eventsQuery = supporter_user_id
        ? supabaseAdmin.from("tip_intents").select("tip_amount, supporter_ip, created_at").eq("supporter_user_id", supporter_user_id).gt("created_at", since15m).order("created_at", { ascending: false }).limit(50)
        : supabaseAdmin.from("tip_intents").select("tip_amount, supporter_ip, created_at").eq("supporter_ip", supporter_ip).gt("created_at", since15m).order("created_at", { ascending: false }).limit(50);
      const { data: evtRows } = await eventsQuery;
      recentEvents = evtRows ?? [];

      // Fetch supporter profile for risk context
      if (supporter_user_id) {
        const { data: suppProf } = await supabaseAdmin
          .from("profiles")
          .select("risk_score, restriction_count, created_at, is_verified")
          .eq("user_id", supporter_user_id)
          .maybeSingle();
        if (suppProf) {
          currentRiskScore = suppProf.risk_score ?? 0;
          previousRestrictions = suppProf.restriction_count ?? 0;
          isVerified = suppProf.is_verified === true;
          if (suppProf.created_at) {
            accountAgeHours = (Date.now() - new Date(suppProf.created_at).getTime()) / (1000 * 60 * 60);
          }
        }
      }
    } catch (_) {}

    // Step A: Rule engine (fast, deterministic)
    const ruleResult = analyzeTransaction({
      amount: tip_amount,
      isRefund: false,
      recentTips: recentEvents.length,
      accountAgeHours,
    });

    // Step B: Run hybrid orchestrator (rules + behavior + AI)
    const hybridFraud = await runFraudCheck({
      userId: supporter_user_id,
      ip: supporter_ip,
      amount: tip_amount,
      ruleScore: ruleResult.score,
      ruleFlags: ruleResult.flags,
      events: recentEvents.map((e) => ({
        amount: Number(e.tip_amount),
        ip: e.supporter_ip ?? undefined,
        created_at: e.created_at,
      })),
      accountAgeHours,
      currentRiskScore,
      previousRestrictions,
      isAnonymous: is_anonymous,
      isVerified,
    });

    // Log to legacy fraud_events for backward compat
    if (hybridFraud.totalScore > 20) {
      try {
        await supabaseAdmin.from("fraud_events").insert({
          user_id: supporter_user_id,
          ip: supporter_ip || null,
          type: "hybrid_score",
          reason: hybridFraud.flags.join(", "),
          score: hybridFraud.totalScore,
          meta: {
            rule_score: hybridFraud.ruleScore,
            behavior_score: hybridFraud.behaviorScore,
            ai_score: hybridFraud.aiScore,
            ai_reason: hybridFraud.aiReason,
            decision: hybridFraud.decision,
            flags: hybridFraud.flags,
            amount: tip_amount,
          },
        });
      } catch (_) {}
    }

    // Update supporter's risk score if identified
    if (hybridFraud.totalScore > 20 && supporter_user_id) {
      try {
        await supabaseAdmin.rpc("increment_risk_score", {
          uid: supporter_user_id,
          delta: Math.round(hybridFraud.totalScore * 0.5), // Scale down to avoid inflation
        });
      } catch (_) {}
    }

    // Block high-risk transactions (restrict) or flag for review
    if (hybridFraud.decision === "restrict") {
      if (supporter_user_id) {
        try {
          const { data: currentProf } = await supabaseAdmin
            .from("profiles")
            .select("restriction_count")
            .eq("user_id", supporter_user_id)
            .maybeSingle();
          const rCount = (currentProf?.restriction_count ?? 0) + 1;
          const isPermanent = rCount >= 3;

          await supabaseAdmin
            .from("profiles")
            .update({
              account_status: "restricted",
              status_reason: isPermanent
                ? `Permanent restriction (${rCount} offenses). ${humanizeFlags(hybridFraud.flags).join(", ")}`
                : `Suspicious activity detected: ${humanizeFlags(hybridFraud.flags).join(", ")}`,
              restriction_count: rCount,
              restricted_until: isPermanent ? null : undefined,
            })
            .eq("user_id", supporter_user_id);
          await createRiskAlert({
            user_id: supporter_user_id,
            type: "hybrid_fraud_critical",
            message: `Transaction blocked: hybrid score ${hybridFraud.totalScore} [R:${hybridFraud.ruleScore} B:${hybridFraud.behaviorScore} AI:${hybridFraud.aiScore}] (${humanizeFlags(hybridFraud.flags).join(", ")})`,
            severity: "critical",
          });
          notifyAdmins({
            title: "User Auto-Restricted (AI+Rules)",
            body: `User ${supporter_user_id} restricted. Score: ${hybridFraud.totalScore} [Rules:${hybridFraud.ruleScore} Behavior:${hybridFraud.behaviorScore} AI:${hybridFraud.aiScore}]`,
          }).catch(() => {});
          createNotification({
            userId: supporter_user_id,
            type: "security",
            title: "Your account has been restricted",
            body: isPermanent
              ? `Your account has been permanently restricted due to repeated violations (${humanizeFlags(hybridFraud.flags).join(", ")}). Please contact support@1nelink.com.`
              : `Your account has been temporarily restricted due to unusual activity (${humanizeFlags(hybridFraud.flags).join(", ")}). You can request a review from your dashboard or contact support@1nelink.com.`,
          }).catch(() => {});
        } catch (_) {}
      }
      return NextResponse.json({ error: "Transaction declined" }, { status: 403 });
    }

    // Flag for manual review — allow transaction but alert admins
    if (hybridFraud.decision === "review") {
      notifyAdmins({
        title: "Transaction Flagged for Review",
        body: `Score: ${hybridFraud.totalScore} [R:${hybridFraud.ruleScore} B:${hybridFraud.behaviorScore} AI:${hybridFraud.aiScore}]. User: ${supporter_user_id ?? supporter_ip}. Amount: $${tip_amount}`,
      }).catch(() => {});
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, stripe_account_id, handle, display_name, stripe_charges_enabled, account_status")
      .eq("user_id", creator_user_id)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    // State-driven creator checks
    const creatorStatus = profile.account_status ?? "active";
    if (creatorStatus === "closed" || creatorStatus === "closed_finalized") {
      return NextResponse.json({ error: "This creator is no longer receiving tips" }, { status: 400 });
    }
    if (creatorStatus === "restricted" || creatorStatus === "suspended") {
      return NextResponse.json({ error: "This creator's account is temporarily unavailable" }, { status: 403 });
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({ error: "Creator payouts not enabled" }, { status: 409 });
    }
    if (!profile.stripe_charges_enabled) {
      return NextResponse.json({ error: "Creator charges not enabled" }, { status: 409 });
    }

    // Fees
    const { stripeFee, platformFee, total: totalCharge } = calculateTipFees(tip_amount);

    // Generate receipt id now (so we can show link instantly after payment)
    const receipt_id = crypto.randomUUID();

    // Insert a tip_intents row BEFORE calling Stripe so we can use the DB id
    // as a stable idempotency key. This guarantees one Stripe charge per DB row.
    const { data: intentRow, error: intentErr } = await supabaseAdmin
      .from("tip_intents")
      .insert({
        creator_user_id,
        tip_amount: tip_amount,
        stripe_fee: stripeFee,
        platform_fee: platformFee,
        total_charge: totalCharge,
        receipt_id,
        note,
        supporter_name: is_anonymous ? null : supporter_name,
        message,
        is_anonymous,
        status: "pending",
        supporter_user_id: supporter_user_id,
        supporter_ip: supporter_ip || null,
      })
      .select()
      .single();

    if (intentErr || !intentRow) {
      console.error("[create-intent] tip_intents insert error:", intentErr);
      return NextResponse.json({ error: "Failed to create tip intent" }, { status: 500 });
    }

    // Create PaymentIntent (use idempotency key derived from DB id)
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
        idempotencyKey: `tip-${intentRow.receipt_id}`,
      }
    );

    // Update tip_intents row with Stripe PaymentIntent id and mark created
    await supabaseAdmin
      .from("tip_intents")
      .update({ stripe_payment_intent_id: pi.id, status: "created" })
      .eq("receipt_id", intentRow.receipt_id);

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
    console.error("create-intent error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
