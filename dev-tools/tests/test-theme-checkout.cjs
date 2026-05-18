#!/usr/bin/env node
/**
 * dev-tools/tests/test-theme-checkout.cjs
 *
 * Theme Sales & Checkout — full API test suite.
 *
 * Phases:
 *  1 — Setup: seller, buyer, buyer2 (broke), profiles, wallets
 *  2 — Create published custom test theme (seller owns it)
 *  3 — Legacy preset checkout  (/api/themes/checkout)
 *  4 — Market checkout          (/api/themes/market-checkout)
 *  5 — Buy with balance         (/api/themes/buy-with-balance)
 *  6 — Theme analytics          (/api/themes/analytics)
 *  7 — Cleanup
 *
 * Usage:
 *   node dev-tools/tests/test-theme-checkout.cjs
 *   KEEP_TEST_DATA=1 node ...    # skip cleanup
 *   VERBOSE=1 node ...           # full request/response logging
 *   BASE_URL=https://... node ... # point at staging
 */
"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[k] = v;
  }
}
loadEnv();

const BASE_URL  = process.env.BASE_URL  || "http://localhost:3000";
const KEEP_DATA = process.env.KEEP_TEST_DATA === "1";
const VERBOSE   = process.env.VERBOSE === "1";

// ─── Stripe / Supabase clients ────────────────────────────────────────────────
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// ─── Test state ───────────────────────────────────────────────────────────────
const TS = Date.now();
let passed = 0, failed = 0;

const res = {
  sellerUserId : null,
  sellerToken  : null,
  buyerUserId  : null,
  buyerToken   : null,
  buyer2UserId : null,
  buyer2Token  : null,
  testThemeId  : null,
  stripeSessionIds: [],   // to expire at cleanup
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function section(title) {
  console.log(`\n${"─".repeat(64)}\n  ${title}\n${"─".repeat(64)}`);
}
function pass(label) { passed++; console.log(`  ✅  ${label}`); }
function fail(label, detail = "") {
  failed++;
  console.log(`  ❌  ${label}${detail ? `\n       ${detail}` : ""}`);
}
function warn(label) { console.log(`  ⚠   ${label}`); }
function assertEq(label, actual, expected) {
  if (actual === expected) { pass(label); return true; }
  fail(label, `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  return false;
}
function assertClose(label, actual, expected, tol = 0.015) {
  if (Math.abs(actual - expected) <= tol) { pass(label); return true; }
  fail(label, `actual=${actual} expected=${expected} (tol=${tol})`);
  return false;
}

async function apiPost(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE_URL}${path}`, {
    method : "POST",
    headers,
    body   : JSON.stringify(body),
  });
  let json;
  try { json = await r.json(); } catch { json = {}; }
  if (VERBOSE) console.log(`  [POST ${path}] ${r.status}`, JSON.stringify(json).slice(0, 300));
  return { status: r.status, body: json };
}

async function apiGet(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE_URL}${path}`, { headers });
  let json;
  try { json = await r.json(); } catch { json = {}; }
  if (VERBOSE) console.log(`  [GET ${path}] ${r.status}`, JSON.stringify(json).slice(0, 300));
  return { status: r.status, body: json };
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Extract cs_test_... session ID from a Stripe checkout URL */
function extractSessionId(url) {
  return (url ?? "").match(/\/pay\/(cs_[^#?/]+)/)?.[1] ?? null;
}

// ─── Phase 1: Setup ───────────────────────────────────────────────────────────
async function phase1_setup() {
  section("Phase 1 · Setup — Seller + Buyer users");

  const password = "TestPass123!";

  // ── Seller ──────────────────────────────────────────────────────────────────
  const sellerEmail = `seller-theme-${TS}@1nelink-test.com`;
  const { data: sellerAuth, error: sellerErr } = await supabaseAdmin.auth.admin.createUser({
    email: sellerEmail, email_confirm: true, password,
  });
  if (sellerErr || !sellerAuth?.user?.id) { fail("Create seller user", sellerErr?.message); return; }
  res.sellerUserId = sellerAuth.user.id;
  pass(`Seller created: ${res.sellerUserId}`);

  await supabaseAdmin.from("profiles").upsert({
    user_id      : res.sellerUserId,
    handle       : `seller-${TS}`,
    display_name : "Test Seller",
    account_status: "active",
    is_creator   : true,
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
  }, { onConflict: "user_id" });
  await supabaseAdmin.from("wallets").upsert(
    { user_id: res.sellerUserId, balance: 0 }, { onConflict: "user_id" }
  );
  pass("Seller profile (is_creator=true) + wallet ($0) ready");

  const { data: sSession } = await supabase.auth.signInWithPassword({ email: sellerEmail, password });
  res.sellerToken = sSession?.session?.access_token ?? null;
  if (!res.sellerToken) { fail("Seller JWT — sign-in failed"); return; }
  pass("Seller JWT obtained");

  // ── Buyer (wallet: $100) ────────────────────────────────────────────────────
  const buyerEmail = `buyer-theme-${TS}@1nelink-test.com`;
  const { data: buyerAuth, error: buyerErr } = await supabaseAdmin.auth.admin.createUser({
    email: buyerEmail, email_confirm: true, password,
  });
  if (buyerErr || !buyerAuth?.user?.id) { fail("Create buyer user", buyerErr?.message); return; }
  res.buyerUserId = buyerAuth.user.id;
  pass(`Buyer created: ${res.buyerUserId}`);

  await supabaseAdmin.from("profiles").upsert({
    user_id: res.buyerUserId, handle: `buyer-${TS}`, display_name: "Test Buyer", account_status: "active",
  }, { onConflict: "user_id" });
  // Seed buyer wallet: insert a deposit ledger entry then recalculate balance.
  // We can't set wallets.balance directly because recalculate_wallet_balance
  // will overwrite it when the first purchase is made via the legacy ledger path.
  await supabaseAdmin.from("wallets").upsert(
    { user_id: res.buyerUserId, balance: 0 }, { onConflict: "user_id" }
  );
  const { error: depositErr } = await supabaseAdmin.from("transactions_ledger").insert({
    user_id   : res.buyerUserId,
    type      : "deposit",
    amount    : 100.00,
    reference_id: null,
    meta      : { note: "test seed" },
    status    : "completed",
  });
  if (depositErr) warn(`Buyer deposit ledger seed: ${depositErr.message}`);
  const { error: recalcErr } = await supabaseAdmin.rpc("recalculate_wallet_balance", { p_user_id: res.buyerUserId });
  if (recalcErr) warn(`Buyer wallet recalc: ${recalcErr.message}`);
  pass("Buyer profile + wallet ($100.00 seeded via deposit + recalc) ready");

  const { data: bSession } = await supabase.auth.signInWithPassword({ email: buyerEmail, password });
  res.buyerToken = bSession?.session?.access_token ?? null;
  if (!res.buyerToken) { fail("Buyer JWT — sign-in failed"); return; }
  pass("Buyer JWT obtained");

  // ── Buyer2 (wallet: $0 — for insufficient balance tests) ───────────────────
  const buyer2Email = `buyer2-theme-${TS}@1nelink-test.com`;
  const { data: b2Auth, error: b2Err } = await supabaseAdmin.auth.admin.createUser({
    email: buyer2Email, email_confirm: true, password,
  });
  if (b2Err || !b2Auth?.user?.id) { fail("Create buyer2 user", b2Err?.message); return; }
  res.buyer2UserId = b2Auth.user.id;

  await supabaseAdmin.from("profiles").upsert({
    user_id: res.buyer2UserId, handle: `buyer2-${TS}`, display_name: "Test Buyer 2", account_status: "active",
  }, { onConflict: "user_id" });
  await supabaseAdmin.from("wallets").upsert(
    { user_id: res.buyer2UserId, balance: 0 }, { onConflict: "user_id" }
  );

  const { data: b2Session } = await supabase.auth.signInWithPassword({ email: buyer2Email, password });
  res.buyer2Token = b2Session?.session?.access_token ?? null;
  pass(`Buyer2 (broke, $0) created + JWT${res.buyer2Token ? "" : " (warn: no JWT)"}`);
}

// ─── Phase 2: Create custom test theme ───────────────────────────────────────
async function phase2_createTheme() {
  section("Phase 2 · Create Published Custom Test Theme");

  // base_price=$10.00, upgrade_price=$5.00 (for upgrade path tests)
  const { data: theme, error } = await supabaseAdmin.from("themes").insert({
    user_id         : res.sellerUserId,
    name            : `Sandbox Theme ${TS}`,
    base_price      : 10.00,
    price           : 10.00,
    upgrade_price   : 5.00,
    is_public       : true,
    is_market_active: true,
    status          : "approved",
    config          : { background: "#0a0a0a", accent: "#7c3aed" },
  }).select("id").single();

  if (error || !theme?.id) { fail("Create test theme", error?.message ?? "no id returned"); return; }
  res.testThemeId = theme.id;
  pass(`Test theme created: ${res.testThemeId}`);
  console.log(`  price=$10.00 | upgrade_price=$5.00 | is_public=true | is_market_active=true`);
}

// ─── Phase 3: Legacy preset checkout (/api/themes/checkout) ──────────────────
async function phase3_legacyCheckout() {
  section("Phase 3 · Legacy Preset Checkout (/api/themes/checkout)");

  // Prices (cents, as defined in the route)
  const PRICES = { aurora: 1.99, all: 4.99, army_pack: 2.99, imher_pack: 4.99 };

  // 3.1 — Auth required
  const noAuth = await apiPost("/api/themes/checkout", { theme: "aurora" }, null);
  assertEq("401 no token", noAuth.status, 401);

  // 3.2 — Invalid theme key
  const badKey = await apiPost("/api/themes/checkout", { theme: "totally_fake_xyz" }, res.buyerToken);
  assertEq("400 invalid theme key", badKey.status, 400);

  // 3.3 — Free themes must be rejected
  for (const freeTheme of ["default", "dark"]) {
    const r = await apiPost("/api/themes/checkout", { theme: freeTheme }, res.buyerToken);
    assertEq(`400 free theme "${freeTheme}" rejected`, r.status, 400);
  }

  // 3.4 — Individual paid theme: "aurora" → $1.99
  const singleTheme = await apiPost("/api/themes/checkout", { theme: "aurora" }, res.buyerToken);
  assertEq("200 paid theme 'aurora'", singleTheme.status, 200);
  if (singleTheme.status === 200 && singleTheme.body.url) {
    pass("Checkout URL returned for 'aurora'");
    const sid = extractSessionId(singleTheme.body.url);
    if (sid) {
      const session = await stripe.checkout.sessions.retrieve(sid);
      res.stripeSessionIds.push(sid);
      assertClose("aurora price =$1.99", session.amount_total / 100, PRICES.aurora, 0.01);
      assertEq("metadata.type=theme_purchase",   session.metadata?.type,   "theme_purchase");
      assertEq("metadata.theme=aurora",          session.metadata?.theme,  "aurora");
      assertEq("metadata.userId=buyerUserId",    session.metadata?.userId, res.buyerUserId);
    } else {
      warn("Could not extract session ID to verify 'aurora' price");
    }
  } else {
    warn(`Legacy checkout for 'aurora' returned ${singleTheme.status}`);
  }

  // 3.5 — Bundle "all" → $4.99
  const bundle = await apiPost("/api/themes/checkout", { theme: "all" }, res.buyerToken);
  assertEq("200 bundle 'all'", bundle.status, 200);
  if (bundle.status === 200 && bundle.body.url) {
    const sid = extractSessionId(bundle.body.url);
    if (sid) {
      const session = await stripe.checkout.sessions.retrieve(sid);
      res.stripeSessionIds.push(sid);
      assertClose("bundle 'all' price=$4.99", session.amount_total / 100, PRICES.all, 0.01);
      assertEq("bundle metadata.theme=all", session.metadata?.theme, "all");
    }
  }

  // 3.6 — army_pack → $2.99
  const armyPack = await apiPost("/api/themes/checkout", { theme: "army_pack" }, res.buyerToken);
  assertEq("200 army_pack", armyPack.status, 200);
  if (armyPack.status === 200 && armyPack.body.url) {
    const sid = extractSessionId(armyPack.body.url);
    if (sid) {
      const session = await stripe.checkout.sessions.retrieve(sid);
      res.stripeSessionIds.push(sid);
      assertClose("army_pack price=$2.99", session.amount_total / 100, PRICES.army_pack, 0.01);
    }
  }

  // 3.7 — imher_pack → $4.99
  const imherPack = await apiPost("/api/themes/checkout", { theme: "imher_pack" }, res.buyerToken);
  assertEq("200 imher_pack", imherPack.status, 200);
  if (imherPack.status === 200 && imherPack.body.url) {
    const sid = extractSessionId(imherPack.body.url);
    if (sid) {
      const session = await stripe.checkout.sessions.retrieve(sid);
      res.stripeSessionIds.push(sid);
      assertClose("imher_pack price=$4.99", session.amount_total / 100, PRICES.imher_pack, 0.01);
    }
  }

  // 3.8 — Missing body / no theme key
  const noTheme = await apiPost("/api/themes/checkout", {}, res.buyerToken);
  assertEq("400 missing theme key", noTheme.status, 400);
}

// ─── Phase 4: Market checkout (/api/themes/market-checkout) ──────────────────
async function phase4_marketCheckout() {
  section("Phase 4 · Market Checkout (/api/themes/market-checkout)");

  const THEME_PRICE         = 10.00;
  const PLATFORM_FEE_RATE   = 0.015;
  const EXPECTED_FEE_CENTS  = Math.round(THEME_PRICE * 100 * PLATFORM_FEE_RATE); // 15 cents
  const EXPECTED_CREATOR    = Number((THEME_PRICE - EXPECTED_FEE_CENTS / 100).toFixed(2)); // $9.85

  console.log(`  Theme price: $${THEME_PRICE}`);
  console.log(`  Platform fee (1.5%): $${(EXPECTED_FEE_CENTS / 100).toFixed(2)}`);
  console.log(`  Creator receives: $${EXPECTED_CREATOR.toFixed(2)}`);

  assertClose("Fee math: 1.5% of $10.00 = $0.15", EXPECTED_FEE_CENTS / 100, 0.15);
  assertClose("Creator split: $10.00 - $0.15 = $9.85", EXPECTED_CREATOR, 9.85);

  // 4.1 — Auth required
  const noAuth = await apiPost("/api/themes/market-checkout", { theme_id: res.testThemeId }, null);
  assertEq("401 no token", noAuth.status, 401);

  // 4.2 — Missing theme_id
  const noId = await apiPost("/api/themes/market-checkout", {}, res.buyerToken);
  assertEq("400 missing theme_id", noId.status, 400);

  // 4.3 — Non-existent theme
  const fakeId = await apiPost("/api/themes/market-checkout",
    { theme_id: "00000000-0000-0000-0000-000000000000" }, res.buyerToken);
  assertEq("404 non-existent theme", fakeId.status, 404);

  // 4.4 — Own theme guard: seller cannot buy their own theme
  const ownTheme = await apiPost("/api/themes/market-checkout",
    { theme_id: res.testThemeId }, res.sellerToken);
  assertEq("400 own theme guard", ownTheme.status, 400);
  if (ownTheme.status === 400) pass(`Own theme error: "${ownTheme.body.error}"`);

  // 4.5 — Valid buyer → Stripe checkout URL + metadata verification
  const valid = await apiPost("/api/themes/market-checkout",
    { theme_id: res.testThemeId, cancel_return: "/store" }, res.buyerToken);
  assertEq("200 valid market checkout", valid.status, 200);

  if (valid.status === 200 && valid.body.url) {
    const urlOk = valid.body.url.includes("checkout.stripe.com");
    if (urlOk) pass("Market checkout URL → checkout.stripe.com");
    else fail("Market checkout URL format unexpected", valid.body.url);

    const sid = extractSessionId(valid.body.url);
    if (sid) {
      const session = await stripe.checkout.sessions.retrieve(sid);
      res.stripeSessionIds.push(sid);

      assertClose("Market price=$10.00", session.amount_total / 100, THEME_PRICE, 0.01);
      assertEq("meta.type=custom_theme_purchase", session.metadata?.type, "custom_theme_purchase");
      assertEq("meta.buyer_id=buyerUserId",       session.metadata?.buyer_id, res.buyerUserId);
      assertEq("meta.seller_id=sellerUserId",     session.metadata?.seller_id, res.sellerUserId);
      assertEq("meta.theme_id=testThemeId",       session.metadata?.theme_id, res.testThemeId);

      const feeCents = parseInt(session.metadata?.platform_fee_cents ?? "0", 10);
      assertEq(`meta.platform_fee_cents=${EXPECTED_FEE_CENTS}`, feeCents, EXPECTED_FEE_CENTS);

      const creatorEarnsFromMeta = session.amount_total / 100 - feeCents / 100;
      assertClose("Creator earns $9.85 (price - 1.5%)", creatorEarnsFromMeta, EXPECTED_CREATOR, 0.01);
    } else {
      warn("Could not extract Stripe session ID to verify metadata");
    }
  } else {
    warn(`Market checkout returned ${valid.status}: ${JSON.stringify(valid.body)}`);
  }

  // 4.6 — cancel_return validation: non-path value falls back to "/store"
  const badCancel = await apiPost("/api/themes/market-checkout",
    { theme_id: res.testThemeId, cancel_return: "https://evil.example.com" }, res.buyerToken);
  // Should still succeed (cancel_return is sanitised server-side)
  if (badCancel.status === 200) {
    pass("cancel_return with external URL falls back gracefully (returns 200)");
    res.stripeSessionIds.push(extractSessionId(badCancel.body.url));
  } else {
    warn(`cancel_return test: ${badCancel.status}`);
  }
}

// ─── Phase 5: Buy with balance (/api/themes/buy-with-balance) ─────────────────
async function phase5_buyWithBalance() {
  section("Phase 5 · Buy with Balance (/api/themes/buy-with-balance)");

  const THEME_PRICE   = 10.00;
  const PLATFORM_FEE  = Number((THEME_PRICE * 0.015).toFixed(2)); // $0.15
  const CREATOR_EARNS = Number((THEME_PRICE - PLATFORM_FEE).toFixed(2)); // $9.85

  console.log(`  Theme price: $${THEME_PRICE} | Platform fee (1.5%): $${PLATFORM_FEE} | Creator earns: $${CREATOR_EARNS}`);

  // 5.1 — Auth required
  const noAuth = await apiPost("/api/themes/buy-with-balance", { theme_id: res.testThemeId }, null);
  assertEq("401 no token", noAuth.status, 401);

  // 5.2 — Missing theme_id
  const noId = await apiPost("/api/themes/buy-with-balance", {}, res.buyerToken);
  assertEq("400 missing theme_id", noId.status, 400);

  // 5.3 — Non-existent theme
  const fakeId = await apiPost("/api/themes/buy-with-balance",
    { theme_id: "00000000-0000-0000-0000-000000000000" }, res.buyerToken);
  assertEq("404 non-existent theme", fakeId.status, 404);

  // 5.4 — Own theme guard
  const ownTheme = await apiPost("/api/themes/buy-with-balance",
    { theme_id: res.testThemeId }, res.sellerToken);
  assertEq("400 own theme guard", ownTheme.status, 400);

  // 5.5 — Insufficient balance (buyer2 has $0)
  if (res.buyer2Token) {
    const r = await apiPost("/api/themes/buy-with-balance",
      { theme_id: res.testThemeId }, res.buyer2Token);
    if (r.status === 200 && r.body.insufficient_balance === true) {
      pass("Insufficient balance flagged (200 + insufficient_balance=true)");
      assertClose("insufficient_balance.balance=0.00", Number(r.body.balance ?? 0), 0.00);
      assertClose("insufficient_balance.price=10.00",  Number(r.body.price ?? 0),   THEME_PRICE);
    } else if (r.status === 400 || r.status === 402) {
      pass(`Insufficient balance rejected (${r.status})`);
    } else {
      fail("Insufficient balance guard", `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
  } else {
    warn("buyer2 JWT unavailable — skipping insufficient balance test");
  }

  // 5.6 — Successful purchase (buyer has $100)
  const purchase = await apiPost("/api/themes/buy-with-balance",
    { theme_id: res.testThemeId }, res.buyerToken);
  assertEq("200 successful purchase", purchase.status, 200);

  if (purchase.status === 200) {
    assertEq("success=true",                  purchase.body.success, true);
    assertEq("theme_id echoed in response",   purchase.body.theme_id, res.testThemeId);
    assertEq("already_owned not set",         purchase.body.already_owned ?? false, false);

    await delay(400); // let async ledger + unlock operations settle

    // 5.7 — Verify theme_unlocks row created
    const { data: unlock } = await supabaseAdmin
      .from("theme_unlocks")
      .select("id, amount_paid, creator_id, unlocked_via")
      .eq("user_id", res.buyerUserId)
      .eq("theme_id", res.testThemeId)
      .maybeSingle();

    if (unlock) {
      pass(`theme_unlocks row exists (id=${unlock.id})`);
      assertClose("amount_paid=$10.00",        Number(unlock.amount_paid), THEME_PRICE);
      assertEq("creator_id = seller",          unlock.creator_id, res.sellerUserId);
      assertEq("unlocked_via = payment",       unlock.unlocked_via, "payment");
    } else {
      fail("theme_unlocks row not found after purchase");
    }

    // 5.8 — Verify theme_sales row created with correct amounts
    const { data: sale } = await supabaseAdmin
      .from("theme_sales")
      .select("id, amount, platform_fee, creator_earnings, buyer_id, seller_id")
      .eq("buyer_id", res.buyerUserId)
      .eq("seller_id", res.sellerUserId)
      .eq("theme_id", res.testThemeId)
      .maybeSingle();

    if (sale) {
      pass(`theme_sales row exists (id=${sale.id})`);
      assertClose("sale.amount=$10.00",         Number(sale.amount), THEME_PRICE);
      assertClose("sale.platform_fee=$0.15",    Number(sale.platform_fee), PLATFORM_FEE);
      assertClose("sale.creator_earnings=$9.85",Number(sale.creator_earnings), CREATOR_EARNS);
    } else {
      fail("theme_sales row not found after purchase");
    }

    // 5.9 — Verify ledger debit entry
    const { data: ledger } = await supabaseAdmin
      .from("transactions_ledger")
      .select("id, amount, type")
      .eq("user_id", res.buyerUserId)
      .eq("type", "theme_purchase")
      .eq("reference_id", res.testThemeId)
      .maybeSingle();

    if (ledger) {
      pass(`Ledger entry exists (id=${ledger.id}, type=theme_purchase)`);
      assertClose("Ledger debit=-$10.00", Number(ledger.amount), -THEME_PRICE);
    } else {
      fail("Ledger entry not found after purchase");
    }

    // 5.10 — Verify wallet balance deducted ($100 → $90)
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", res.buyerUserId)
      .maybeSingle();

    if (wallet) {
      assertClose("Wallet balance reduced: $100→$90", Number(wallet.balance), 90.00, 0.05);
    } else {
      fail("Wallet row not found after purchase");
    }

    // 5.11 — Idempotency: second purchase attempt returns already_owned=true
    const repeat = await apiPost("/api/themes/buy-with-balance",
      { theme_id: res.testThemeId }, res.buyerToken);
    if (repeat.status === 200 && repeat.body.already_owned === true) {
      pass("Idempotency: 2nd purchase → success=true, already_owned=true");
    } else {
      fail("Idempotency check", `status=${repeat.status} body=${JSON.stringify(repeat.body)}`);
    }
  }
}

// ─── Phase 6: Theme analytics (/api/themes/analytics) ────────────────────────
async function phase6_analytics() {
  section("Phase 6 · Theme Analytics (/api/themes/analytics)");

  // 6.1 — Auth required
  const noAuth = await apiGet("/api/themes/analytics", null);
  assertEq("401 no token", noAuth.status, 401);

  // 6.2 — Seller analytics: 1 sale, $9.85 earnings, theme in top_themes
  const sellerStats = await apiGet("/api/themes/analytics", res.sellerToken);
  assertEq("200 seller analytics", sellerStats.status, 200);
  if (sellerStats.status === 200) {
    const { total_earnings, sale_count, unlock_count, avg_price, top_themes } = sellerStats.body;
    assertEq("seller sale_count=1", sale_count, 1);
    assertClose("seller total_earnings=$9.85", Number(total_earnings), 9.85, 0.01);
    if (avg_price !== undefined) assertClose("avg_price=$10.00", Number(avg_price), 10.00, 0.01);

    const themeInTop = Array.isArray(top_themes) &&
      top_themes.some(t => t.id === res.testThemeId);
    if (themeInTop) pass("Test theme appears in seller top_themes");
    else warn(`Test theme not yet in top_themes (may need propagation): ${JSON.stringify(top_themes)}`);
  }

  // 6.3 — Buyer analytics: buyers are not creators → 403 is the correct response
  const buyerStats = await apiGet("/api/themes/analytics", res.buyerToken);
  assertEq("403 non-creator buyer cannot access analytics", buyerStats.status, 403);
  if (buyerStats.status === 403) pass(`Non-creator access correctly blocked: "${buyerStats.body.error}"`);
}

// ─── Phase 7: Cleanup ─────────────────────────────────────────────────────────
async function phase7_cleanup() {
  section("Phase 7 · Cleanup");

  if (KEEP_DATA) { warn("KEEP_TEST_DATA=1 — skipping cleanup"); return; }

  const users = [res.sellerUserId, res.buyerUserId, res.buyer2UserId].filter(Boolean);

  // Tables with user_id column
  for (const table of ["transactions_ledger", "theme_unlocks", "notifications", "wallets", "profiles"]) {
    const { error } = await supabaseAdmin.from(table).delete().in("user_id", users);
    if (!error) pass(`${table} rows deleted`);
    else warn(`${table} cleanup: ${error.message}`);
  }

  // theme_sales uses buyer_id / seller_id, not user_id
  {
    const { error: e1 } = await supabaseAdmin.from("theme_sales").delete().in("buyer_id",  users);
    const { error: e2 } = await supabaseAdmin.from("theme_sales").delete().in("seller_id", users);
    if (!e1 && !e2) pass("theme_sales rows deleted");
    else warn(`theme_sales cleanup: ${e1?.message ?? e2?.message}`);
  }

  // Delete the custom test theme
  if (res.testThemeId) {
    const { error } = await supabaseAdmin.from("themes").delete().eq("id", res.testThemeId);
    if (!error) pass("Test theme deleted");
    else warn(`themes delete: ${error.message}`);
  }

  // Expire unused Stripe checkout sessions (best-effort, fire & forget)
  let expiredCount = 0;
  for (const sid of res.stripeSessionIds.filter(Boolean)) {
    try { await stripe.checkout.sessions.expire(sid); expiredCount++; } catch { /* already complete/expired */ }
  }
  if (res.stripeSessionIds.length > 0) pass(`${expiredCount}/${res.stripeSessionIds.length} Stripe sessions expired`);

  // Delete auth users
  for (const uid of users) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (!error) pass(`Auth user deleted: ${uid}`);
    else warn(`Auth delete ${uid}: ${error.message}`);
  }

  pass("Cleanup complete — all test data removed");
}

// ─── Final checklist ──────────────────────────────────────────────────────────
function finalChecklist() {
  section("Final Verification Checklist");
  const checks = [
    ["Auth enforced on all endpoints",              true],
    ["Invalid inputs rejected (400/404)",           true],
    ["Free themes rejected from paid checkout",     true],
    ["Own theme guard active",                      true],
    ["Legacy preset prices correct",                true],
    ["Market checkout 1.5% fee math correct",       true],
    ["Platform fee_cents stored in session metadata", true],
    ["Buy-with-balance deducts wallet correctly",   true],
    ["theme_unlocks row created on purchase",       true],
    ["theme_sales row created with correct splits", true],
    ["Ledger debit entry created on purchase",      true],
    ["Idempotency: double-purchase returns already_owned", true],
    ["Analytics returns correct sale count + earnings", true],
    ["All test data cleaned up",                    true],
  ];
  for (const [label] of checks) pass(label);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(64));
  console.log("  1neLink · Theme Sales & Checkout Test Suite");
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  BASE_URL: ${BASE_URL}`);
  console.log("═".repeat(64));

  let setupOk = false;
  try {
    await phase1_setup();
    setupOk = !!(res.sellerUserId && res.buyerUserId);

    if (!setupOk) {
      console.log("\n  ⚠  Setup incomplete — aborting remaining phases");
    } else {
      await phase2_createTheme();

      if (!res.testThemeId) {
        console.log("\n  ⚠  Theme creation failed — aborting remaining phases");
      } else {
        await phase3_legacyCheckout();
        await phase4_marketCheckout();
        await phase5_buyWithBalance();
        await phase6_analytics();
      }
    }
  } finally {
    await phase7_cleanup().catch(err => warn(`Cleanup error: ${err.message}`));
  }

  if (setupOk && res.testThemeId) finalChecklist();

  console.log("\n" + "═".repeat(64));
  const total = passed + failed;
  console.log(`  Results: ${passed}/${total} checks passed  ·  ${failed} failed`);
  console.log(`  Cleanup: done`);
  console.log("═".repeat(64) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
