#!/usr/bin/env node
/**
 * reconcile-stuck-tips.cjs
 *
 * Finds tip_intents stuck in "created" or "pending" status where the
 * Stripe PaymentIntent actually succeeded, then credits the creator and
 * marks the intent as succeeded — exactly what the missed webhook would
 * have done.
 *
 * Usage:
 *   # Preview only (safe, no writes):
 *   node dev-tools/scripts/reconcile-stuck-tips.cjs
 *
 *   # Actually process:
 *   EXECUTE=true node dev-tools/scripts/reconcile-stuck-tips.cjs
 *
 *   # Use live Stripe key:
 *   STRIPE_SECRET_KEY=sk_live_... EXECUTE=true node dev-tools/scripts/reconcile-stuck-tips.cjs
 *
 * Env vars (falls back to .env.local):
 *   STRIPE_SECRET_KEY         — Stripe secret key (test or live)
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *   EXECUTE                   — Set to "true" to actually write changes
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const STRIPE_SECRET_KEY         = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL  || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXECUTE                   = process.env.EXECUTE === "true";

if (!STRIPE_SECRET_KEY)         { console.error("❌  Missing STRIPE_SECRET_KEY"); process.exit(1); }
if (!SUPABASE_URL)              { console.error("❌  Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL"); process.exit(1); }
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error("❌  Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const isLive = STRIPE_SECRET_KEY.startsWith("sk_live_");

// ── Lazy-load deps ───────────────────────────────────────────────────────────
let Stripe, createClient;
try {
  Stripe       = require("stripe");
  createClient = require("@supabase/supabase-js").createClient;
} catch {
  console.error("❌  Missing npm dependencies. Run: npm install stripe @supabase/supabase-js");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Call Supabase add_ledger_entry_atomic RPC; falls back to two-step insert. */
async function addLedgerEntry({ user_id, type, amount, reference_id, meta }) {
  const { data, error } = await supabase.rpc("add_ledger_entry_atomic", {
    p_user_id:      user_id,
    p_type:         type,
    p_amount:       amount,
    p_reference_id: reference_id ?? null,
    p_meta:         meta ?? {},
    p_status:       "completed",
  });

  if (error) {
    const isNotFound =
      error.message.includes("does not exist") ||
      error.message.includes("Could not find the function") ||
      error.code === "PGRST202";
    if (isNotFound) {
      // Legacy two-step fallback
      const { error: insErr } = await supabase.from("transactions_ledger").insert({
        user_id,
        type,
        amount,
        reference_id: reference_id ?? null,
        meta:         meta ?? {},
        status:       "completed",
        created_at:   new Date().toISOString(),
      });
      if (insErr) throw new Error(`Ledger insert failed: ${insErr.message}`);

      const { error: recalcErr } = await supabase.rpc("recalculate_wallet_balance", { p_user_id: user_id });
      if (recalcErr) throw new Error(`Wallet recalc failed: ${recalcErr.message}`);
      return;
    }
    throw new Error(`Ledger RPC failed: ${error.message}`);
  }

  return data;
}

/** Search Stripe for a PaymentIntent by receipt_id metadata. Returns PI or null. */
async function findStripePI(receiptId) {
  try {
    const results = await stripe.paymentIntents.search({
      query: `metadata['receipt_id']:'${receiptId}'`,
      limit: 5,
    });
    return results.data[0] ?? null;
  } catch (err) {
    // search() may not be available on all Stripe accounts — treat as not found
    const isUnsupported =
      err?.statusCode === 403 ||
      err?.code === "feature_not_available" ||
      err?.code === "search_not_enabled" ||
      err?.statusCode === 400 ||
      (err?.message && err.message.toLowerCase().includes("search"));
    if (isUnsupported) {
      return null;
    }
    throw err;
  }
}

/** Format dollars */
const usd = (n) => `$${Number(n).toFixed(2)}`;

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("─────────────────────────────────────────────────────────────");
  console.log("🔄  Stuck Tip Reconciliation");
  console.log(`    Mode:    ${isLive ? "🔴 LIVE" : "🟡 TEST"}`);
  console.log(`    Execute: ${EXECUTE ? "✅ YES — changes will be written" : "🔍 DRY RUN — no writes"}`);
  console.log("─────────────────────────────────────────────────────────────\n");

  // 1. Fetch stuck tip_intents
  const { data: stuckTips, error: fetchErr } = await supabase
    .from("tip_intents")
    .select(`
      receipt_id,
      creator_user_id,
      tip_amount,
      stripe_fee,
      platform_fee,
      total_charge,
      supporter_email,
      supporter_name,
      is_anonymous,
      message,
      status,
      stripe_payment_intent_id,
      created_at
    `)
    .in("status", ["created", "pending"])
    .order("created_at", { ascending: true });

  if (fetchErr) {
    console.error("❌  Failed to query tip_intents:", fetchErr.message);
    process.exit(1);
  }

  if (!stuckTips || stuckTips.length === 0) {
    console.log("✅  No stuck tip_intents found. All clear!");
    return;
  }

  console.log(`Found ${stuckTips.length} stuck tip_intent(s):\n`);

  const results = { processed: 0, skipped: 0, errors: 0, notSucceeded: 0, needsLiveKey: 0 };

  for (const tip of stuckTips) {
    const {
      receipt_id, creator_user_id, tip_amount, stripe_fee, platform_fee,
      supporter_email, supporter_name, is_anonymous, message, status,
      stripe_payment_intent_id, created_at,
    } = tip;

    const amount = Number(tip_amount);
    const date   = new Date(created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    console.log(`┌─ ${receipt_id}`);
    console.log(`│  Amount:  ${usd(amount)}   Status: ${status}   Date: ${date}`);
    console.log(`│  Creator: ${creator_user_id}`);

    // 2. Look up the Stripe PaymentIntent
    let pi = null;

    if (stripe_payment_intent_id) {
      // We already know the PI id
      try {
        pi = await stripe.paymentIntents.retrieve(stripe_payment_intent_id);
        console.log(`│  Stripe PI: ${pi.id}  (retrieved by stored id)`);
      } catch (err) {
        // "similar object exists in live mode" → this is a real live payment; need live key
        if (err.message && err.message.includes("similar object exists in live mode")) {
          console.log(`│  🔴  LIVE PAYMENT — requires live Stripe key (sk_live_...) to reconcile`);
          console.log(`│     PI: ${stripe_payment_intent_id}`);
          results.needsLiveKey = (results.needsLiveKey || 0) + 1;
        } else if (err.message && err.message.includes("No such payment_intent")) {
          console.log(`│  ⚠️   PI ${stripe_payment_intent_id} not found in Stripe — may have been deleted`);
          results.skipped++;
        } else {
          console.error(`│  ❌  Stripe retrieve error [${err.statusCode ?? err.code ?? "?"}]: ${err.message}`);
          results.errors++;
        }
        console.log("└\n");
        continue;
      }
    } else {
      // Search by receipt_id metadata
      try {
        pi = await findStripePI(receipt_id);
        if (pi) {
          console.log(`│  Stripe PI: ${pi.id}  (found via metadata search)`);
        } else {
          console.log(`│  ⚠️   No Stripe PI found for receipt_id — may not have reached Stripe`);
          results.skipped++;
          console.log("└\n");
          continue;
        }
      } catch (err) {
        if (err.message && err.message.includes("similar object exists in live mode")) {
          console.log(`│  🔴  LIVE PAYMENT — requires live Stripe key (sk_live_...) to reconcile`);
          results.needsLiveKey = (results.needsLiveKey || 0) + 1;
        } else {
          console.error(`│  ❌  Stripe search error [${err.statusCode ?? err.code ?? "?"}]: ${err.message}`);
          results.errors++;
        }
        console.log("└\n");
        continue;
      }
    }

    console.log(`│  Stripe status: ${pi.status}`);

    if (pi.status !== "succeeded") {
      const piAmountUsd = pi.amount ? usd(pi.amount / 100) : "?";
      console.log(`│  ⏭️   Skipping — Stripe PI is "${pi.status}" (${piAmountUsd} ${pi.currency?.toUpperCase()})`);
      if (pi.last_payment_error) {
        console.log(`│      Last error: ${pi.last_payment_error.message}`);
      }
      results.notSucceeded++;
      console.log("└\n");
      continue;
    }

    // 3. Check creator account status
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_status, display_name, handle")
      .eq("user_id", creator_user_id)
      .maybeSingle();

    if (profile?.account_status && profile.account_status !== "active") {
      console.log(`│  🚫  Skipping — creator account status is "${profile.account_status}"`);
      results.skipped++;
      console.log("└\n");
      continue;
    }

    const creatorLabel = profile?.display_name || profile?.handle || creator_user_id;
    console.log(`│  Creator: @${profile?.handle ?? "?"} (${creatorLabel})`);
    console.log(`│  ✅  Eligible for reconciliation`);

    if (!EXECUTE) {
      console.log(`│  🔍  [DRY RUN] Would credit ${usd(amount)} to creator`);
      results.processed++;
      console.log("└\n");
      continue;
    }

    // 4. Write ledger entry
    try {
      await addLedgerEntry({
        user_id:      creator_user_id,
        type:         "tip_received",
        amount:       amount,
        reference_id: receipt_id,
        meta: {
          action:         "tip",
          fee:            Number(stripe_fee ?? 0) + Number(platform_fee ?? 0),
          net:            amount,
          stripe_fee:     Number(stripe_fee ?? 0),
          platform_fee:   Number(platform_fee ?? 0),
          currency:       pi.currency,
          receipt_id:     receipt_id,
          event_id:       `reconcile_${receipt_id}`,
          external_id:    pi.id,
          supporter_name: is_anonymous ? null : (supporter_name || null),
          message:        message || null,
          is_anonymous:   is_anonymous ?? true,
          reconciled:     true,
          reconciled_at:  new Date().toISOString(),
        },
      });
      console.log(`│  💰  Ledger entry written: ${usd(amount)} → ${creator_user_id}`);
    } catch (ledgerErr) {
      console.error(`│  ❌  Ledger write failed: ${ledgerErr.message}`);
      results.errors++;
      console.log("└\n");
      continue;
    }

    // 5. Update tip_intent status
    const { error: updateErr } = await supabase
      .from("tip_intents")
      .update({
        status:                    "succeeded",
        stripe_payment_intent_id:  pi.id,
      })
      .eq("receipt_id", receipt_id);

    if (updateErr) {
      console.error(`│  ❌  Failed to update tip_intent status: ${updateErr.message}`);
      // Ledger is already written — log the error but don't re-throw
      // (idempotent: if re-run, ledger will be idempotent via reference_id)
      results.errors++;
      console.log("└\n");
      continue;
    }

    console.log(`│  ✅  tip_intent marked succeeded`);
    results.processed++;
    console.log("└\n");
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────────────────────────");
  console.log("Summary:");
  console.log(`  ✅  Processed (${EXECUTE ? "credited" : "would credit"}): ${results.processed}`);
  console.log(`  ⏭️   Not yet succeeded in Stripe:                          ${results.notSucceeded}`);
  console.log(`  ⚠️   Skipped (no PI found / inactive account):             ${results.skipped}`);
  console.log(`  🔴  Need live Stripe key:                                  ${results.needsLiveKey}`);
  console.log(`  ❌  Errors:                                                 ${results.errors}`);

  if (!EXECUTE && results.processed > 0) {
    console.log(`\n👉  Re-run with EXECUTE=true to apply these ${results.processed} fix(es).`);
  }
  if (results.needsLiveKey > 0 && !isLive) {
    console.log(`\n👉  ${results.needsLiveKey} payment(s) are LIVE mode — run again with your sk_live_... key:`);
    console.log(`    STRIPE_SECRET_KEY=sk_live_... EXECUTE=true node dev-tools/scripts/reconcile-stuck-tips.cjs`);
  }
  console.log("─────────────────────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
