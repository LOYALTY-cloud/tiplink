#!/usr/bin/env node
/**
 * dev-tools/tests/test-store-disable.cjs
 *
 * Store Disable/Enable — full API test suite.
 *
 * Phases:
 *  1 — Setup: admin, creator, buyer users
 *  2 — Create published theme (seller)
 *  3 — Admin disables store (with reason + duration)
 *  4 — Verify purchase routes block disabled store
 *  5 — Verify /api/creator/apply returns store_disabled fields
 *  6 — Verify admin re-enable clears all fields
 *  7 — Cleanup
 *
 * Usage:
 *   node dev-tools/tests/test-store-disable.cjs
 *   KEEP_TEST_DATA=1 node ...    # skip cleanup
 *   VERBOSE=1 node ...           # full request/response logging
 *   BASE_URL=https://... node ... # point at staging
 */
"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Load .env.local ─────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadEnv();

const BASE_URL  = process.env.BASE_URL  || "http://localhost:3000";
const KEEP_DATA = process.env.KEEP_TEST_DATA === "1";
const VERBOSE   = process.env.VERBOSE === "1";

// ─── Clients ─────────────────────────────────────────────────────────────────
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Test state ───────────────────────────────────────────────────────────────
const TS = Date.now();
let passed = 0, failed = 0;

const res = {
  adminUserId   : null,
  adminDisplayId: null,   // profiles.admin_id (e.g. "OWN-XXXXXX") used in X-Admin-Id header
  adminToken    : null,   // service-role acts as admin
  sellerUserId  : null,
  sellerToken   : null,
  buyerUserId   : null,
  buyerToken    : null,
  testThemeId   : null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function section(title) {
  console.log(`\n${"─".repeat(64)}\n  ${title}\n${"─".repeat(64)}`);
}
function pass(label) { passed++; console.log(`  ✅  ${label}`); }
function fail(label, detail = "") {
  failed++;
  console.log(`  ❌  ${label}${detail ? `\n       ${detail}` : ""}`);
}
function assertEq(label, actual, expected) {
  if (actual === expected) { pass(label); return true; }
  fail(label, `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  return false;
}
function assertNotNull(label, value) {
  if (value != null) { pass(label); return true; }
  fail(label, "value was null/undefined");
  return false;
}

async function apiPost(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST", headers, body: JSON.stringify(body),
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

async function apiPatch(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH", headers, body: JSON.stringify(body),
  });
  let json;
  try { json = await r.json(); } catch { json = {}; }
  if (VERBOSE) console.log(`  [PATCH ${path}] ${r.status}`, JSON.stringify(json).slice(0, 300));
  return { status: r.status, body: json };
}

// ─── Phase 1: Setup ───────────────────────────────────────────────────────────
async function phase1_setup() {
  section("Phase 1 · Setup — admin, seller, buyer");

  const password = "TestPass123!";
  const sellerEmail = `store-test-seller-${TS}@test.local`;
  const buyerEmail  = `store-test-buyer-${TS}@test.local`;

  // Create seller
  const { data: sellerAuth, error: sellerErr } = await supabaseAdmin.auth.admin.createUser({
    email: sellerEmail, email_confirm: true, password,
  });
  if (sellerErr || !sellerAuth?.user?.id) { fail("Create seller user", sellerErr?.message); return; }
  res.sellerUserId = sellerAuth.user.id;
  pass(`Seller created: ${res.sellerUserId}`);

  // Create seller profile + store (is_creator, active store)
  await supabaseAdmin.from("profiles").upsert({
    user_id: res.sellerUserId,
    handle: `storetestseller${TS}`,
    display_name: "Store Test Seller",
    email: sellerEmail,
    is_creator: true,
    account_status: "active",
    store_disabled: false,
  });

  const { error: storeErr } = await supabaseAdmin.from("creator_stores").insert({
    user_id: res.sellerUserId,
    store_name: `Test Store ${TS}`,
    slug: `test-store-${TS}`,
    is_active: true,
  });
  if (storeErr) { fail("Create seller store", storeErr.message); return; }
  pass("Seller profile (is_creator=true) + active store ready");

  // Sign in seller
  const { data: sSession } = await supabase.auth.signInWithPassword({ email: sellerEmail, password });
  res.sellerToken = sSession?.session?.access_token;
  if (!res.sellerToken) { fail("Seller JWT — sign-in failed"); return; }
  pass("Seller JWT obtained");

  // Create buyer
  const { data: buyerAuth, error: buyerErr } = await supabaseAdmin.auth.admin.createUser({
    email: buyerEmail, email_confirm: true, password,
  });
  if (buyerErr || !buyerAuth?.user?.id) { fail("Create buyer user", buyerErr?.message); return; }
  res.buyerUserId = buyerAuth.user.id;

  await supabaseAdmin.from("profiles").upsert({
    user_id: res.buyerUserId,
    handle: `storetestbuyer${TS}`,
    display_name: "Store Test Buyer",
    email: buyerEmail,
    account_status: "active",
  });

  const { data: bSession } = await supabase.auth.signInWithPassword({ email: buyerEmail, password });
  res.buyerToken = bSession?.session?.access_token;
  if (!res.buyerToken) { fail("Buyer JWT — sign-in failed"); return; }
  pass("Buyer JWT obtained");

  // Create an admin user for PATCH calls
  // Use an existing admin from the admins table, or insert a test one
  const { data: adminRow } = await supabaseAdmin
    .from("admins")
    .select("user_id, role")
    .in("role", ["owner", "super_admin"])
    .limit(1)
    .maybeSingle();

  if (adminRow) {
    res.adminUserId = adminRow.user_id;
    // Fetch the display admin_id (e.g. "OWN-XXXXXX") for X-Admin-Id header
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("admin_id")
      .eq("user_id", adminRow.user_id)
      .maybeSingle();
    res.adminDisplayId = adminProfile?.admin_id ?? null;
    pass(`Using existing admin (${adminRow.role}): ${res.adminUserId} / X-Admin-Id=${res.adminDisplayId}`);
  } else {
    fail("No owner/super_admin found in admins table — PATCH tests will be skipped");
  }
}

// ─── Phase 2: Create a published theme ────────────────────────────────────────
async function phase2_create_theme() {
  section("Phase 2 · Create published marketplace theme (seller)");

  const { data: theme, error } = await supabaseAdmin
    .from("themes")
    .insert({
      user_id: res.sellerUserId,
      name: `Store Test Theme ${TS}`,
      config: { background: "#111" },
      is_public: true,
      is_market_active: true,
      base_price: 299,    // $2.99
      status: "approved",
    })
    .select("id")
    .single();

  if (error || !theme) { fail("Create test theme", error?.message); return; }
  res.testThemeId = theme.id;
  pass(`Theme created: ${res.testThemeId}`);
}

// ─── Phase 3: Admin disables store ────────────────────────────────────────────
async function phase3_disable_store() {
  section("Phase 3 · Admin disables store (reason + duration)");

  if (!res.adminUserId) {
    console.log("  ⚠  Skipped — no admin user available");
    return;
  }
  if (!res.sellerUserId) { fail("No seller userId"); return; }

  // ── 3a: Disable without reason → should fail ──
  // Use the display admin_id ("OWN-XXXXXX") for legacy X-Admin-Id header auth.
  const adminHeaders = {
    "Content-Type": "application/json",
    "X-Admin-Id": res.adminDisplayId ?? res.adminUserId,
  };

  const r1 = await fetch(`${BASE_URL}/api/admin/users/${res.sellerUserId}/store`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ disabled: true }),  // missing reason
  });
  const j1 = await r1.json().catch(() => ({}));
  if (VERBOSE) console.log(`  [PATCH store no-reason] ${r1.status}`, j1);
  assertEq("Disable without reason → 400", r1.status, 400);

  // ── 3b: Disable with reason + 15 days ──
  const r2 = await fetch(`${BASE_URL}/api/admin/users/${res.sellerUserId}/store`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      disabled: true,
      reason: "Test policy violation",
      duration_days: 15,
    }),
  });
  const j2 = await r2.json().catch(() => ({}));
  if (VERBOSE) console.log(`  [PATCH store disable] ${r2.status}`, j2);
  assertEq("Disable with reason + 15d → 200", r2.status, 200);
  assertEq("Response.ok = true", j2.ok, true);
  assertEq("Response.store_disabled = true", j2.store_disabled, true);
  assertNotNull("Response has store_disabled_until", j2.store_disabled_until);
  assertEq("Response has reason", j2.store_disabled_reason, "Test policy violation");

  // Verify until is ~15 days from now (within 1 minute tolerance)
  if (j2.store_disabled_until) {
    const until = new Date(j2.store_disabled_until).getTime();
    const expected = Date.now() + 15 * 86_400_000;
    const diffMin = Math.abs(until - expected) / 60_000;
    if (diffMin < 2) {
      pass("store_disabled_until is ~15 days from now");
    } else {
      fail("store_disabled_until out of range", `diff=${diffMin.toFixed(1)} min`);
    }
  }

  // ── 3c: Verify DB was updated ──
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("store_disabled, store_disabled_until, store_disabled_reason")
    .eq("user_id", res.sellerUserId)
    .maybeSingle();

  assertEq("DB: store_disabled=true", profile?.store_disabled, true);
  assertEq("DB: store_disabled_reason set", profile?.store_disabled_reason, "Test policy violation");
  assertNotNull("DB: store_disabled_until set", profile?.store_disabled_until);
}

// ─── Phase 4: Purchase routes block disabled store ────────────────────────────
async function phase4_purchase_blocked() {
  section("Phase 4 · Purchase routes block disabled store");

  if (!res.buyerToken || !res.testThemeId) {
    console.log("  ⚠  Skipped — missing buyer token or theme ID");
    return;
  }

  // ── 4a: market-free-unlock should be blocked ──
  // First make theme free for testing
  await supabaseAdmin.from("themes").update({ base_price: 0 }).eq("id", res.testThemeId);

  const r1 = await apiPost("/api/themes/market-free-unlock", { theme_id: res.testThemeId }, res.buyerToken);
  assertEq("market-free-unlock blocked for disabled store → 404", r1.status, 404);
  assertEq("market-free-unlock error message", r1.body.error, "This theme is no longer available");

  // Reset price for paid tests
  await supabaseAdmin.from("themes").update({ base_price: 299 }).eq("id", res.testThemeId);

  // ── 4b: create-payment-intent should be blocked ──
  const r2 = await apiPost("/api/themes/create-payment-intent", { theme_id: res.testThemeId }, res.buyerToken);
  assertEq("create-payment-intent blocked for disabled store → 404", r2.status, 404);
  assertEq("create-payment-intent error message", r2.body.error, "This theme is no longer available");

  // ── 4c: buy-with-balance should be blocked ──
  const r3 = await apiPost("/api/themes/buy-with-balance", { theme_id: res.testThemeId }, res.buyerToken);
  assertEq("buy-with-balance blocked for disabled store → 404", r3.status, 404);
  assertEq("buy-with-balance error message", r3.body.error, "This theme is no longer available");
}

// ─── Phase 5: Creator apply returns store_disabled fields ─────────────────────
async function phase5_creator_apply_fields() {
  section("Phase 5 · /api/creator/apply returns store_disabled fields");

  if (!res.sellerToken) {
    console.log("  ⚠  Skipped — no seller token");
    return;
  }

  const r = await apiGet("/api/creator/apply", res.sellerToken);
  assertEq("GET /api/creator/apply → 200", r.status, 200);
  assertEq("store_disabled = true", r.body.store_disabled, true);
  assertNotNull("store_disabled_until present", r.body.store_disabled_until);
  assertEq("store_disabled_reason correct", r.body.store_disabled_reason, "Test policy violation");
}

// ─── Phase 6: Admin re-enables store ──────────────────────────────────────────
async function phase6_reenable_store() {
  section("Phase 6 · Admin re-enables store");

  if (!res.adminUserId || !res.sellerUserId) {
    console.log("  ⚠  Skipped — no admin or seller");
    return;
  }

  const adminHeaders = {
    "Content-Type": "application/json",
    "X-Admin-Id": res.adminDisplayId ?? res.adminUserId,
  };

  const r = await fetch(`${BASE_URL}/api/admin/users/${res.sellerUserId}/store`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ disabled: false }),
  });
  const j = await r.json().catch(() => ({}));
  if (VERBOSE) console.log(`  [PATCH store re-enable] ${r.status}`, j);
  assertEq("Re-enable → 200", r.status, 200);
  assertEq("Response.store_disabled = false", j.store_disabled, false);

  // Verify DB cleared
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("store_disabled, store_disabled_until, store_disabled_reason")
    .eq("user_id", res.sellerUserId)
    .maybeSingle();

  assertEq("DB: store_disabled=false", profile?.store_disabled, false);
  assertEq("DB: store_disabled_until cleared", profile?.store_disabled_until ?? null, null);
  assertEq("DB: store_disabled_reason cleared", profile?.store_disabled_reason ?? null, null);

  // Purchase should work again (free theme)
  if (res.buyerToken && res.testThemeId) {
    await supabaseAdmin.from("themes").update({ base_price: 0 }).eq("id", res.testThemeId);
    const r2 = await apiPost("/api/themes/market-free-unlock", { theme_id: res.testThemeId }, res.buyerToken);
    // 200 = success, 400 = already_owned (both are fine for this check)
    const allowed = r2.status === 200 || r2.status === 400;
    if (allowed) pass("market-free-unlock allowed after re-enable");
    else fail("market-free-unlock still blocked after re-enable", `status=${r2.status} body=${JSON.stringify(r2.body)}`);
  }
}

// ─── Phase 7: Cleanup ──────────────────────────────────────────────────────────
async function phase7_cleanup() {
  if (KEEP_DATA) { console.log("\n  ⚠  KEEP_TEST_DATA=1 — skipping cleanup"); return; }
  section("Phase 7 · Cleanup");

  if (res.testThemeId) {
    await supabaseAdmin.from("theme_unlocks").delete().eq("theme_id", res.testThemeId);
    await supabaseAdmin.from("themes").delete().eq("id", res.testThemeId);
    pass("Test theme deleted");
  }
  if (res.sellerUserId) {
    await supabaseAdmin.from("creator_stores").delete().eq("user_id", res.sellerUserId);
    await supabaseAdmin.from("profiles").delete().eq("user_id", res.sellerUserId);
    await supabaseAdmin.auth.admin.deleteUser(res.sellerUserId);
    pass("Seller user deleted");
  }
  if (res.buyerUserId) {
    await supabaseAdmin.from("profiles").delete().eq("user_id", res.buyerUserId);
    await supabaseAdmin.auth.admin.deleteUser(res.buyerUserId);
    pass("Buyer user deleted");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Store Disable/Enable — API Test Suite`);
  console.log(`  BASE_URL: ${BASE_URL}`);
  console.log(`${"═".repeat(64)}`);

  await phase1_setup();
  await phase2_create_theme();
  await phase3_disable_store();
  await phase4_purchase_blocked();
  await phase5_creator_apply_fields();
  await phase6_reenable_store();
  await phase7_cleanup();

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(64)}\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
