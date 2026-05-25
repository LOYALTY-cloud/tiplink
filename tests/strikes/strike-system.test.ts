/**
 * Creator Strike System — Full Test Suite
 *
 * Sections:
 *   1. Schema checks     — columns on creator_strikes + profiles
 *   2. CHECK constraints — severity / status guards
 *   3. Strike CRUD       — insert, read, update status
 *   4. Recalculation     — DB trigger + recalculate_creator_risk RPC
 *   5. Risk thresholds   — watch / restricted / high_risk / banned
 *   6. Marketplace gate  — marketplace_disabled auto-set at restricted+
 *   7. Status recalc     — points drop when strike removed / expired / appealed
 *   8. DMCA-linked       — related_dmca_id FK + strike issued from DMCA context
 *   9. Issued-by FK      — admin profile ID stored correctly
 *  10. Cascade cleanup   — deleting creator deletes strikes (cascade)
 *  11. Live API smoke    — auth guards (403/401) on all new routes
 *
 * Run: npx tsx --env-file=.env.local tests/strikes/strike-system.test.ts
 * With live server: TEST_BASE_URL=http://localhost:3000 npx tsx --env-file=.env.local tests/strikes/strike-system.test.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * All test rows are created under a dedicated test auth user and fully
 * cleaned up (including the auth user itself) at the end.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL         = process.env.TEST_BASE_URL || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Counters ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const errors: string[] = [];

function ok(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✅  ${msg}`);
  } else {
    failed++;
    const m = `  ❌  ${msg}`;
    console.error(m);
    errors.push(msg);
  }
}

function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

// ─── Test state ───────────────────────────────────────────────────────────────
const TS = Date.now();
let creatorUserId  = "";
let creatorProfileId = "";
let adminUserId    = "";
let adminProfileId = "";
let createdStrikeIds: string[] = [];
let createdDmcaIds:   string[] = [];

// ─── Seed helpers ─────────────────────────────────────────────────────────────
async function seedAuthUser(label: string, extra: Record<string, unknown> = {}) {
  const email = `strike-test-${label}-${TS}@test.invalid`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `Test${TS}!Pw`,
    email_confirm: true,
    user_metadata: { display_name: `Strike Test ${label}` },
  });
  if (error || !data.user) throw new Error(`seedAuthUser(${label}): ${error?.message}`);
  const userId = data.user.id;

  const { data: prof, error: profErr } = await db.from("profiles").upsert({
    user_id:      userId,
    email,
    handle:       `strike-test-${label}-${TS}`,
    display_name: `Strike Test ${label}`,
    first_name:   "Strike",
    last_name:    `Test ${label}`,
    role:         "user",
    account_status: "active",
    is_active:    true,
    ...extra,
  }, { onConflict: "user_id" }).select("id").single();
  if (profErr || !prof) throw new Error(`seedAuthUser profile(${label}): ${profErr?.message}`);

  return { userId, profileId: prof.id as string, email };
}

async function seedStrike(overrides: Record<string, unknown> = {}) {
  const { data, error } = await db.from("creator_strikes").insert({
    creator_id:   creatorUserId,
    severity:     "warning",
    reason:       `Test strike ${TS}`,
    strike_points: 1,
    status:       "active",
    ...overrides,
  }).select("id").single();
  if (error || !data) throw new Error(`seedStrike: ${error?.message}`);
  createdStrikeIds.push(data.id as string);
  return data.id as string;
}

async function getProfile() {
  const { data } = await db
    .from("profiles")
    .select("creator_strike_points, creator_risk_level, marketplace_disabled")
    .eq("user_id", creatorUserId)
    .single();
  return data as { creator_strike_points: number; creator_risk_level: string; marketplace_disabled: boolean } | null;
}

async function resetCreatorRisk() {
  // Remove all active strikes for the test creator and recalculate
  await db.from("creator_strikes").delete().eq("creator_id", creatorUserId);
  createdStrikeIds = [];
  await db.rpc("recalculate_creator_risk", { p_creator_id: creatorUserId });
  // Also re-enable marketplace in case it was auto-disabled
  await db.from("profiles").update({ marketplace_disabled: false }).eq("user_id", creatorUserId);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log("\n  🧹 Cleaning up…");
  // Strikes cascade-delete with the auth user; do both explicitly anyway
  if (createdStrikeIds.length) {
    await db.from("creator_strikes").delete().in("id", createdStrikeIds);
  }
  if (createdDmcaIds.length) {
    await db.from("dmca_reports").delete().in("id", createdDmcaIds);
  }
  if (creatorUserId) await db.auth.admin.deleteUser(creatorUserId);
  if (adminUserId)   await db.auth.admin.deleteUser(adminUserId);
  console.log("  🧹 Cleanup done");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SCHEMA CHECKS
// ═══════════════════════════════════════════════════════════════════════════════
async function testSchema() {
  section("1. Schema Checks");

  // creator_strikes columns
  const { error: csErr } = await db
    .from("creator_strikes")
    .select("id, creator_id, theme_id, reason, expires_at, created_at, severity, notes, strike_points, status, issued_by, related_dmca_id")
    .limit(0);
  ok(!csErr, `creator_strikes — all expected columns exist (${csErr?.message ?? "ok"})`);

  // profiles columns
  const { error: profErr } = await db
    .from("profiles")
    .select("id, user_id, creator_strike_points, creator_risk_level, marketplace_disabled")
    .limit(0);
  ok(!profErr, `profiles — creator_strike_points / creator_risk_level / marketplace_disabled exist (${profErr?.message ?? "ok"})`);

  // Verify defaults on profiles
  const { data: profDefaults } = await db
    .from("profiles")
    .select("creator_strike_points, creator_risk_level, marketplace_disabled")
    .eq("user_id", creatorUserId)
    .single();
  ok(profDefaults?.creator_strike_points === 0,    `profiles — creator_strike_points defaults to 0`);
  ok(profDefaults?.creator_risk_level    === "normal", `profiles — creator_risk_level defaults to "normal"`);
  ok(profDefaults?.marketplace_disabled  === false, `profiles — marketplace_disabled defaults to false`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CHECK CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════════════════
async function testCheckConstraints() {
  section("2. CHECK Constraints");

  // Invalid severity → rejected
  const { error: badSev } = await db.from("creator_strikes").insert({
    creator_id:   creatorUserId,
    severity:     "extreme",      // not in ('warning','minor','major','critical')
    reason:       "bad severity test",
    strike_points: 1,
    status:       "active",
  });
  ok(!!badSev, `creator_strikes — invalid severity "extreme" is rejected (${badSev?.message?.includes("check") || badSev?.message?.includes("violates") ? "check violation" : badSev?.message ?? "err"})`);

  // Invalid status → rejected
  const { error: badStatus } = await db.from("creator_strikes").insert({
    creator_id:   creatorUserId,
    severity:     "warning",
    reason:       "bad status test",
    strike_points: 1,
    status:       "pending",     // not in ('active','appealed','removed','expired')
  });
  ok(!!badStatus, `creator_strikes — invalid status "pending" is rejected`);

  // Invalid creator_risk_level on profiles → rejected
  const { error: badRisk } = await db.from("profiles")
    .update({ creator_risk_level: "extreme_risk" })
    .eq("user_id", creatorUserId);
  ok(!!badRisk, `profiles — invalid creator_risk_level "extreme_risk" is rejected`);

  // Valid severity + status → accepted
  const { data: valid, error: validErr } = await db.from("creator_strikes").insert({
    creator_id:   creatorUserId,
    severity:     "minor",
    reason:       "valid constraint test",
    strike_points: 2,
    status:       "active",
  }).select("id").single();
  ok(!validErr && !!valid?.id, `creator_strikes — valid severity/status accepted`);
  if (valid?.id) {
    createdStrikeIds.push(valid.id);
    await db.from("creator_strikes").delete().eq("id", valid.id);
    createdStrikeIds = createdStrikeIds.filter((i) => i !== valid.id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. STRIKE CRUD
// ═══════════════════════════════════════════════════════════════════════════════
async function testStrikeCRUD() {
  section("3. Strike CRUD");

  await resetCreatorRisk();

  // Insert a warning strike
  const strikeId = await seedStrike({ severity: "warning", strike_points: 1 });
  const { data: fetched } = await db.from("creator_strikes").select("*").eq("id", strikeId).single();
  ok(!!fetched,                              `Strike — inserted and readable`);
  ok(fetched?.severity      === "warning",   `Strike — severity is "warning"`);
  ok(fetched?.strike_points === 1,           `Strike — strike_points is 1`);
  ok(fetched?.status        === "active",    `Strike — status defaults to "active"`);
  ok(fetched?.reason        !== null,        `Strike — reason is stored`);

  // Update notes
  await db.from("creator_strikes").update({ notes: "Updated note" }).eq("id", strikeId);
  const { data: updated } = await db.from("creator_strikes").select("notes").eq("id", strikeId).single();
  ok(updated?.notes === "Updated note", `Strike — notes update persisted`);

  // Update status to appealed
  await db.from("creator_strikes").update({ status: "appealed" }).eq("id", strikeId);
  const { data: appealed } = await db.from("creator_strikes").select("status").eq("id", strikeId).single();
  ok(appealed?.status === "appealed", `Strike — status updated to "appealed"`);

  // Restore to active
  await db.from("creator_strikes").update({ status: "active" }).eq("id", strikeId);

  // Remove
  await db.from("creator_strikes").delete().eq("id", strikeId);
  createdStrikeIds = createdStrikeIds.filter((i) => i !== strikeId);
  const { data: gone } = await db.from("creator_strikes").select("id").eq("id", strikeId).single();
  ok(!gone, `Strike — deleted record is gone`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RECALCULATION — trigger + RPC
// ═══════════════════════════════════════════════════════════════════════════════
async function testRecalculation() {
  section("4. Trigger + recalculate_creator_risk RPC");

  await resetCreatorRisk();

  // Insert 1pt warning — profile should reflect 1pt
  const s1 = await seedStrike({ severity: "warning", strike_points: 1 });
  const p1 = await getProfile();
  ok(p1?.creator_strike_points === 1, `Recalc — 1 warning strike → profile shows 1 pt (got ${p1?.creator_strike_points})`);
  ok(p1?.creator_risk_level === "normal", `Recalc — 1 pt → risk is "normal" (got ${p1?.creator_risk_level})`);

  // Insert another 1pt → total 2
  const s2 = await seedStrike({ severity: "warning", strike_points: 1 });
  const p2 = await getProfile();
  ok(p2?.creator_strike_points === 2, `Recalc — 2 warnings → profile shows 2 pts (got ${p2?.creator_strike_points})`);

  // Explicit RPC call also returns correct count
  await db.rpc("recalculate_creator_risk", { p_creator_id: creatorUserId });
  const p2b = await getProfile();
  ok(p2b?.creator_strike_points === 2, `Recalc — explicit RPC call returns same count`);

  // Delete one strike — trigger fires, points drop
  await db.from("creator_strikes").delete().eq("id", s1);
  createdStrikeIds = createdStrikeIds.filter((i) => i !== s1);
  const p3 = await getProfile();
  ok(p3?.creator_strike_points === 1, `Recalc — after delete, points drop to 1 (got ${p3?.creator_strike_points})`);

  // Cleanup
  await db.from("creator_strikes").delete().eq("id", s2);
  createdStrikeIds = createdStrikeIds.filter((i) => i !== s2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RISK LEVEL THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════
async function testRiskThresholds() {
  section("5. Risk Level Thresholds");

  await resetCreatorRisk();

  // 0 pts → normal
  const p0 = await getProfile();
  ok(p0?.creator_risk_level === "normal", `Thresholds — 0 pts → "normal"`);

  // 3 pts → watch  (1+2 = warning + minor)
  const w1 = await seedStrike({ severity: "warning", strike_points: 1 });
  const w2 = await seedStrike({ severity: "minor",   strike_points: 2 });
  const p3 = await getProfile();
  ok(p3?.creator_strike_points === 3,     `Thresholds — 3 pts accumulated`);
  ok(p3?.creator_risk_level    === "watch", `Thresholds — 3 pts → "watch" (got ${p3?.creator_risk_level})`);

  // 6 pts → restricted  (+1 major = 5 more pts, total 8; but let's add exactly to 6)
  // Reset and use exact: 2+4 = 6 pts? — note points are set by insert, not derived
  await resetCreatorRisk();
  await seedStrike({ severity: "minor",  strike_points: 2 });
  await seedStrike({ severity: "minor",  strike_points: 2 });
  await seedStrike({ severity: "minor",  strike_points: 2 });
  const p6 = await getProfile();
  ok(p6?.creator_strike_points === 6,        `Thresholds — 6 pts accumulated`);
  ok(p6?.creator_risk_level    === "restricted", `Thresholds — 6 pts → "restricted" (got ${p6?.creator_risk_level})`);

  // 11 pts → high_risk
  await resetCreatorRisk();
  await seedStrike({ severity: "major", strike_points: 5 });
  await seedStrike({ severity: "major", strike_points: 5 });
  await seedStrike({ severity: "warning", strike_points: 1 });
  const p11 = await getProfile();
  ok(p11?.creator_strike_points === 11,      `Thresholds — 11 pts accumulated`);
  ok(p11?.creator_risk_level    === "high_risk", `Thresholds — 11 pts → "high_risk" (got ${p11?.creator_risk_level})`);

  // 15 pts → banned
  await resetCreatorRisk();
  await seedStrike({ severity: "critical", strike_points: 10 });
  await seedStrike({ severity: "major",    strike_points: 5 });
  const p15 = await getProfile();
  ok(p15?.creator_strike_points === 15,   `Thresholds — 15 pts accumulated`);
  ok(p15?.creator_risk_level    === "banned", `Thresholds — 15 pts → "banned" (got ${p15?.creator_risk_level})`);

  await resetCreatorRisk();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MARKETPLACE GATE — auto-disabled at restricted+
// ═══════════════════════════════════════════════════════════════════════════════
async function testMarketplaceGate() {
  section("6. Marketplace Gate (marketplace_disabled)");

  await resetCreatorRisk();

  // At watch (3 pts) — marketplace_disabled should remain false
  await seedStrike({ severity: "warning", strike_points: 1 });
  await seedStrike({ severity: "minor",   strike_points: 2 });
  const pWatch = await getProfile();
  ok(pWatch?.creator_risk_level    === "watch", `Gate — watch risk confirmed`);
  ok(pWatch?.marketplace_disabled  === false,   `Gate — marketplace_disabled stays false at watch level`);

  // Add more pts to hit restricted (6+)
  await seedStrike({ severity: "minor", strike_points: 2 });
  await seedStrike({ severity: "warning", strike_points: 1 });
  const pRestricted = await getProfile();
  ok(pRestricted?.creator_risk_level   === "restricted", `Gate — restricted risk confirmed`);
  ok(pRestricted?.marketplace_disabled === true,          `Gate — marketplace_disabled auto-set to true at restricted`);

  // Drop back to normal (delete all) — marketplace_disabled must NOT auto-reset
  await db.from("creator_strikes").delete().eq("creator_id", creatorUserId);
  createdStrikeIds = [];
  await db.rpc("recalculate_creator_risk", { p_creator_id: creatorUserId });
  const pNormal = await getProfile();
  ok(pNormal?.creator_risk_level   === "normal", `Gate — risk level recalculated back to normal`);
  ok(pNormal?.marketplace_disabled === true,     `Gate — marketplace_disabled remains true after risk drops (requires manual admin reset)`);

  // Admin manually re-enables
  await db.from("profiles").update({ marketplace_disabled: false }).eq("user_id", creatorUserId);
  const pRestored = await getProfile();
  ok(pRestored?.marketplace_disabled === false, `Gate — admin can manually re-enable marketplace`);

  await resetCreatorRisk();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. STATUS RECALC — points exclude non-active strikes
// ═══════════════════════════════════════════════════════════════════════════════
async function testStatusRecalc() {
  section("7. Status-Based Point Exclusion");

  await resetCreatorRisk();

  // Insert 3 active strikes (total 3 pts)
  const sA = await seedStrike({ severity: "warning", strike_points: 1 });
  const sB = await seedStrike({ severity: "warning", strike_points: 1 });
  const sC = await seedStrike({ severity: "warning", strike_points: 1 });
  const pBefore = await getProfile();
  ok(pBefore?.creator_strike_points === 3, `StatusRecalc — 3 active strikes = 3 pts before`);

  // Mark one as "removed" → points should drop to 2
  await db.from("creator_strikes").update({ status: "removed" }).eq("id", sA);
  const pRemoved = await getProfile();
  ok(pRemoved?.creator_strike_points === 2, `StatusRecalc — removed strike excluded; 2 pts remain (got ${pRemoved?.creator_strike_points})`);

  // Mark one as "expired" → points should drop to 1
  await db.from("creator_strikes").update({ status: "expired" }).eq("id", sB);
  const pExpired = await getProfile();
  ok(pExpired?.creator_strike_points === 1, `StatusRecalc — expired strike excluded; 1 pt remains (got ${pExpired?.creator_strike_points})`);

  // Mark last as "appealed" → points should drop to 0
  await db.from("creator_strikes").update({ status: "appealed" }).eq("id", sC);
  const pAppealed = await getProfile();
  ok(pAppealed?.creator_strike_points === 0, `StatusRecalc — appealed strike excluded; 0 pts remain (got ${pAppealed?.creator_strike_points})`);
  ok(pAppealed?.creator_risk_level === "normal", `StatusRecalc — risk returns to normal with 0 active pts`);

  // Restore one appeal back to active → points return to 1
  await db.from("creator_strikes").update({ status: "active" }).eq("id", sC);
  const pRestored = await getProfile();
  ok(pRestored?.creator_strike_points === 1, `StatusRecalc — appeal denied, strike re-activated; 1 pt (got ${pRestored?.creator_strike_points})`);

  await resetCreatorRisk();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. DMCA-LINKED STRIKES
// ═══════════════════════════════════════════════════════════════════════════════
async function testDmcaLinkedStrikes() {
  section("8. DMCA-Linked Strikes");

  await resetCreatorRisk();

  // Seed a real DMCA report (anonymous submission to avoid user_id FK)
  const { data: dmcaRow, error: dmcaErr } = await db.from("dmca_reports").insert({
    first_name:             "Test",
    last_name:              "Complainant",
    email:                  `dmca-link-test-${TS}@test.invalid`,
    copyrighted_work:       "Test copyrighted work",
    infringing_content_url: "https://1nelink.com/test-strike-dmca",
    infringement_details:   "Strike DMCA linkage test",
    electronic_signature:   "Test Complainant",
    evidence_urls:          [],
  }).select("id").single();
  ok(!dmcaErr && !!dmcaRow, `DMCA-link — test DMCA report created (${dmcaErr?.message ?? "ok"})`);
  if (dmcaRow) createdDmcaIds.push(dmcaRow.id);

  if (!dmcaRow) return;

  // Issue strike linked to that DMCA report
  const strikeId = await seedStrike({
    severity:        "major",
    strike_points:   5,
    related_dmca_id: dmcaRow.id,
    reason:          "DMCA violation — linked strike test",
  });

  const { data: linked } = await db.from("creator_strikes").select("related_dmca_id, severity").eq("id", strikeId).single();
  ok(linked?.related_dmca_id === dmcaRow.id, `DMCA-link — related_dmca_id stored correctly`);
  ok(linked?.severity === "major",           `DMCA-link — severity "major" stored with DMCA link`);

  const p = await getProfile();
  ok(p?.creator_strike_points === 5, `DMCA-link — profile reflects 5 pts from major strike`);

  // Deleting the DMCA report should not cascade-delete the strike (SET NULL)
  await db.from("dmca_reports").delete().eq("id", dmcaRow.id);
  createdDmcaIds = createdDmcaIds.filter((i) => i !== dmcaRow.id);
  const { data: afterDel } = await db.from("creator_strikes").select("id, related_dmca_id").eq("id", strikeId).single();
  ok(!!afterDel,                              `DMCA-link — strike survives DMCA report deletion`);
  ok(afterDel?.related_dmca_id === null,      `DMCA-link — related_dmca_id set to NULL after DMCA report deleted`);

  await resetCreatorRisk();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ISSUED-BY FK (admin profile)
// ═══════════════════════════════════════════════════════════════════════════════
async function testIssuedBy() {
  section("9. issued_by FK (admin profile)");

  await resetCreatorRisk();

  // Strike with valid issued_by (admin profile id)
  const strikeId = await seedStrike({
    issued_by:    adminProfileId,
    severity:     "minor",
    strike_points: 2,
    reason:       "issued_by FK test",
  });
  const { data: s } = await db.from("creator_strikes").select("issued_by").eq("id", strikeId).single();
  ok(s?.issued_by === adminProfileId, `issued_by — admin profile ID stored correctly`);

  // Strike with NULL issued_by (anonymous / system) — allowed
  const strikeId2 = await seedStrike({ issued_by: null, reason: "system-issued test" });
  const { data: s2 } = await db.from("creator_strikes").select("issued_by").eq("id", strikeId2).single();
  ok(s2?.issued_by === null, `issued_by — null (system/anonymous) allowed`);

  // Strike with fake profile UUID → FK violation
  const { error: fkErr } = await db.from("creator_strikes").insert({
    creator_id:   creatorUserId,
    severity:     "warning",
    reason:       "bad issued_by FK test",
    strike_points: 1,
    status:       "active",
    issued_by:    "ffffffff-ffff-4fff-bfff-ffffffffffff",
  });
  ok(!!fkErr, `issued_by — non-existent profile UUID is rejected (${fkErr?.message?.includes("foreign key") || fkErr?.message?.includes("violates") ? "FK violation caught" : fkErr?.message})`);

  await resetCreatorRisk();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CASCADE — deleting auth user deletes strikes
// ═══════════════════════════════════════════════════════════════════════════════
async function testCascadeDelete() {
  section("10. Cascade Delete (auth user → strikes)");

  // Create a throwaway user + issue a strike against them
  const { userId: tempUserId } = await seedAuthUser("cascade-temp");

  const { data: tempStrike, error: tsErr } = await db.from("creator_strikes").insert({
    creator_id:   tempUserId,
    severity:     "warning",
    reason:       "cascade delete test",
    strike_points: 1,
    status:       "active",
  }).select("id").single();
  ok(!tsErr && !!tempStrike, `Cascade — strike inserted for temp user`);

  const tempStrikeId = tempStrike?.id;

  // Delete the auth user — should cascade-delete strikes
  const { error: delErr } = await db.auth.admin.deleteUser(tempUserId);
  ok(!delErr, `Cascade — auth user deletion succeeded`);

  if (tempStrikeId) {
    const { data: leftover } = await db.from("creator_strikes").select("id").eq("id", tempStrikeId).single();
    ok(!leftover, `Cascade — strike deleted when auth user deleted (cascade)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. LIVE API SMOKE TESTS
// ═══════════════════════════════════════════════════════════════════════════════
async function testLiveApi() {
  section("11. Live API Smoke Tests");

  if (!BASE_URL) {
    console.log("  ⏭   SKIPPED — set TEST_BASE_URL=http://localhost:3000 to enable");
    return;
  }

  async function req(path: string, opts: RequestInit = {}) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual", ...opts });
      const body = await res.text().catch(() => "");
      return { status: res.status, body };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        console.log(`  ⏭   SKIPPED (server not reachable at ${BASE_URL}): ${path}`);
        return { status: -1, body: "" };
      }
      throw e;
    }
  }

  function apiOk(cond: boolean, msg: string, status: number) {
    if (status === -1) { console.log(`  ⏭   SKIPPED — ${msg}`); return; }
    ok(cond, msg);
  }

  // ── GET /api/admin/strikes — no auth → 403
  {
    const { status } = await req("/api/admin/strikes");
    apiOk(status === 403, `GET /api/admin/strikes (no auth) → 403 (got ${status})`, status);
  }

  // ── GET /api/admin/strikes — bad token → 403
  {
    const { status } = await req("/api/admin/strikes", {
      headers: { "x-admin-token": "garbage-token-xyz" },
    });
    apiOk(status === 403, `GET /api/admin/strikes (bad token) → 403 (got ${status})`, status);
  }

  // ── POST /api/admin/strikes — no auth → 403
  {
    const { status } = await req("/api/admin/strikes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creator_id: "test", severity: "warning", reason: "x" }),
    });
    apiOk(status === 403, `POST /api/admin/strikes (no auth) → 403 (got ${status})`, status);
  }

  // ── PATCH /api/admin/strikes/:id — no auth → 403
  {
    const { status } = await req("/api/admin/strikes/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "removed" }),
    });
    apiOk(status === 403, `PATCH /api/admin/strikes/:id (no auth) → 403 (got ${status})`, status);
  }

  // ── GET /api/admin/strikes/:id — no auth → 403
  {
    const { status } = await req("/api/admin/strikes/00000000-0000-0000-0000-000000000000");
    apiOk(status === 403, `GET /api/admin/strikes/:id (no auth) → 403 (got ${status})`, status);
  }

  // ── GET /api/admin/creators/:id/risk — no auth → 403
  {
    const { status } = await req("/api/admin/creators/00000000-0000-0000-0000-000000000000/risk");
    apiOk(status === 403, `GET /api/admin/creators/:id/risk (no auth) → 403 (got ${status})`, status);
  }

  // ── GET /api/account/violations — no token → 401
  {
    const { status } = await req("/api/account/violations");
    apiOk(status === 401, `GET /api/account/violations (no token) → 401 (got ${status})`, status);
  }

  // ── GET /api/account/violations — bad token → 401
  {
    const { status } = await req("/api/account/violations", {
      headers: { Authorization: "Bearer garbage.token.here" },
    });
    apiOk(status === 401, `GET /api/account/violations (bad token) → 401 (got ${status})`, status);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════════
async function setup() {
  console.log("\n  ⚙️  Setting up test users…");
  const creator = await seedAuthUser("creator");
  creatorUserId   = creator.userId;
  creatorProfileId = creator.profileId;

  const admin = await seedAuthUser("admin");
  adminUserId   = admin.userId;
  adminProfileId = admin.profileId;

  console.log(`  👤 Creator: ${creatorUserId}`);
  console.log(`  🛡️  Admin:   ${adminUserId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("\n════════════════════════════════════════════════════");
  console.log("  Creator Strike System — Test Suite");
  console.log(`  ${new Date().toISOString()}`);
  console.log("════════════════════════════════════════════════════");

  try {
    await setup();

    await testSchema();
    await testCheckConstraints();
    await testStrikeCRUD();
    await testRecalculation();
    await testRiskThresholds();
    await testMarketplaceGate();
    await testStatusRecalc();
    await testDmcaLinkedStrikes();
    await testIssuedBy();
    await testCascadeDelete();
    await testLiveApi();
  } catch (fatal: unknown) {
    console.error("\n💥 Fatal error in test runner:", fatal);
    failed++;
  } finally {
    await cleanup();
  }

  console.log("\n════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log(`\n  Failed assertions:`);
    errors.forEach((e) => console.log(`    ❌  ${e}`));
  }
  console.log("════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n💥 Unhandled error:", err);
  cleanup().finally(() => process.exit(1));
});
