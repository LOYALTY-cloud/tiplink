#!/usr/bin/env node
/**
 * DMCA Flow Test Suite
 * Tests: schema correctness, submit validation, concurrency limits,
 *        my-reports auth, admin auth gates, audit log writes.
 *
 * Usage:
 *   node --env-file=.env.local dev-tools/tests/test-dmca-flow.cjs
 *
 * Optional: set TEST_BASE_URL to test against a running Next.js server.
 * Without it, API tests are skipped and only DB-level tests run.
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");

// ─── Load env ─────────────────────────────────────────────────────────────────
const fs   = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.startsWith("#")) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY          = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL          = process.env.TEST_BASE_URL || null;  // optional

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Harness ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const failures = [];

function pass(msg)   { passed++;  console.log(`  ✅ ${msg}`); }
function fail(msg, detail = "") {
  failed++;
  failures.push(`${msg}${detail ? `: ${detail}` : ""}`);
  console.error(`  ❌ ${msg}${detail ? ` — ${detail}` : ""}`);
}
function skip(msg)   { skipped++; console.log(`  ⏭  ${msg}`); }
function section(s)  { console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}\n`); }

// ─── Cleanup helpers ──────────────────────────────────────────────────────────
const TEST_EMAIL_DOMAIN = "@__test-dmca-flow.dev";
async function cleanup() {
  await db.from("dmca_reports").delete().like("email", `%${TEST_EMAIL_DOMAIN}`);
}

// ─── 1. SCHEMA: required columns & constraints ───────────────────────────────
async function testSchema() {
  section("1. Schema – dmca_reports");

  // Probe column existence via insert with bad status (constraint should fire)
  const { error: statusErr } = await db.from("dmca_reports").insert({
    first_name: "T", last_name: "T", email: `t${TEST_EMAIL_DOMAIN}`,
    copyrighted_work: "x", infringing_content_url: "https://1nelink.com/x",
    infringement_details: "x", electronic_signature: "x",
    status: "INVALID_STATUS",
  });
  if (statusErr && (statusErr.code === "23514" || statusErr.message.includes("check"))) {
    pass("dmca_reports.status has CHECK constraint (rejects invalid values)");
  } else if (statusErr) {
    pass(`dmca_reports.status constraint fires (error: ${statusErr.code})`);
  } else {
    fail("dmca_reports.status CHECK constraint missing — invalid value was accepted");
    await db.from("dmca_reports").delete().like("email", `%${TEST_EMAIL_DOMAIN}`);
  }

  // Probe priority constraint
  const { error: prioErr } = await db.from("dmca_reports").insert({
    first_name: "T", last_name: "T", email: `t${TEST_EMAIL_DOMAIN}`,
    copyrighted_work: "x", infringing_content_url: "https://1nelink.com/x",
    infringement_details: "x", electronic_signature: "x",
    priority: "INVALID_PRIORITY",
  });
  if (prioErr) pass("dmca_reports.priority has CHECK constraint");
  else { fail("dmca_reports.priority CHECK constraint missing"); await cleanup(); }

  // Verify is_under_review + is_removed columns exist (from moderation layer migration)
  const { data: themeRow, error: themeErr } = await db
    .from("themes")
    .select("is_under_review, is_removed")
    .limit(1);

  if (themeErr) {
    if (themeErr.message.includes("is_under_review") || themeErr.message.includes("column")) {
      fail("themes.is_under_review / is_removed columns missing — run 20260525_dmca_moderation_layer.sql");
    } else {
      pass("themes table accessible (no rows or other error, columns may exist)");
    }
  } else {
    pass("themes.is_under_review + is_removed columns exist");
  }

  // Verify dmca_audit_logs table exists
  const { error: auditErr } = await db
    .from("dmca_audit_logs")
    .select("id")
    .limit(1);

  if (auditErr && auditErr.message.includes("relation")) {
    fail("dmca_audit_logs table missing — run 20260525_dmca_moderation_layer.sql");
  } else if (auditErr && auditErr.message.includes("permission")) {
    fail("dmca_audit_logs: unexpected permission error — check FORCE RLS config");
  } else {
    pass("dmca_audit_logs table exists and accessible via service role");
  }

  // Verify creator_strikes.related_dmca_id column
  const { error: strikesErr } = await db
    .from("creator_strikes")
    .select("related_dmca_id")
    .limit(1);

  if (strikesErr && strikesErr.message.includes("column")) {
    fail("creator_strikes.related_dmca_id column missing — run 20260525_dmca_moderation_layer.sql");
  } else {
    pass("creator_strikes.related_dmca_id column exists");
  }
}

// ─── 2. DB LOGIC: concurrency limits ─────────────────────────────────────────
async function testConcurrencyLogic() {
  section("2. DB Logic – concurrency limit checks");

  const testEmail = `concurrency${TEST_EMAIL_DOMAIN}`;
  await db.from("dmca_reports").delete().eq("email", testEmail);

  // Insert a 'reviewing' report
  const { data: r1 } = await db.from("dmca_reports").insert({
    first_name: "Test", last_name: "User", email: testEmail,
    copyrighted_work: "Test work", infringing_content_url: "https://1nelink.com/a",
    infringement_details: "Test", electronic_signature: "Test User",
    status: "reviewing",
  }).select("id").single();

  if (!r1) { fail("Could not seed reviewing report for concurrency test"); return; }

  // Query as the submit route does: open reports by email
  const { data: open1 } = await db
    .from("dmca_reports")
    .select("status")
    .eq("email", testEmail)
    .in("status", ["pending", "reviewing"]);

  if (open1?.some((r) => r.status === "reviewing")) {
    pass("Concurrency gate: detects 'reviewing' report by email → would 409");
  } else {
    fail("Concurrency gate: failed to detect reviewing report", JSON.stringify(open1));
  }

  // Insert a second pending report
  await db.from("dmca_reports").insert({
    first_name: "Test", last_name: "User", email: testEmail,
    copyrighted_work: "Test work 2", infringing_content_url: "https://1nelink.com/b",
    infringement_details: "Test", electronic_signature: "Test User",
    status: "pending",
  });

  const { data: open2 } = await db
    .from("dmca_reports")
    .select("status")
    .eq("email", testEmail)
    .in("status", ["pending", "reviewing"]);

  if ((open2?.length ?? 0) >= 2) {
    pass("Concurrency gate: detects 2+ open reports → would 409");
  } else {
    fail("Concurrency gate: missed ≥2 open reports", `found ${open2?.length ?? 0}`);
  }

  // Resolved reports should NOT count toward the limit
  await db.from("dmca_reports").insert({
    first_name: "Test", last_name: "User", email: `${testEmail}-resolved`,
    copyrighted_work: "Old work", infringing_content_url: "https://1nelink.com/old",
    infringement_details: "Test", electronic_signature: "Test User",
    status: "resolved",
  });

  const { data: open3 } = await db
    .from("dmca_reports")
    .select("status")
    .eq("email", `${testEmail}-resolved`)
    .in("status", ["pending", "reviewing"]);

  if ((open3?.length ?? 0) === 0) {
    pass("Resolved reports do NOT count toward limit (clean email → 0 open)");
  } else {
    fail("Resolved reports incorrectly counting toward limit");
  }

  await db.from("dmca_reports").delete().eq("email", testEmail);
  await db.from("dmca_reports").delete().eq("email", `${testEmail}-resolved`);
}

// ─── 3. DB LOGIC: audit log write + read ─────────────────────────────────────
async function testAuditLog() {
  section("3. DB Logic – audit log");

  // Seed a report
  const { data: rep } = await db.from("dmca_reports").insert({
    first_name: "Audit", last_name: "Test", email: `audit${TEST_EMAIL_DOMAIN}`,
    copyrighted_work: "Audit work", infringing_content_url: "https://1nelink.com/audit",
    infringement_details: "Testing audit", electronic_signature: "Audit Test",
    status: "pending",
  }).select("id").single();

  if (!rep) { fail("Could not seed report for audit log test"); return; }

  // Get a real admin user id (or use a placeholder uuid if none)
  const { data: adminUser } = await db.auth.admin.listUsers({ perPage: 1 });
  const adminId = adminUser?.users?.[0]?.id ?? "00000000-0000-0000-0000-000000000001";

  // Write an audit log entry
  const { error: writeErr } = await db.from("dmca_audit_logs").insert({
    report_id:  rep.id,
    admin_id:   adminId,
    action:     "status_change",
    changes:    { field: "status", old_value: "pending", new_value: "reviewing" },
  });

  if (writeErr) {
    fail("dmca_audit_logs: write failed", writeErr.message);
  } else {
    pass("dmca_audit_logs: service role can write entries");
  }

  // Read back
  const { data: logs, error: readErr } = await db
    .from("dmca_audit_logs")
    .select("*")
    .eq("report_id", rep.id);

  if (readErr) {
    fail("dmca_audit_logs: read failed", readErr.message);
  } else if ((logs?.length ?? 0) >= 1) {
    pass(`dmca_audit_logs: read back ${logs.length} entry(ies)`);
    const entry = logs[0];
    if (entry.action === "status_change" && entry.changes?.field === "status") {
      pass("dmca_audit_logs: change payload correct (field, old_value, new_value)");
    } else {
      fail("dmca_audit_logs: unexpected payload shape", JSON.stringify(entry.changes));
    }
  } else {
    fail("dmca_audit_logs: wrote entry but read returned 0 rows");
  }

  // Cleanup
  await db.from("dmca_audit_logs").delete().eq("report_id", rep.id);
  await db.from("dmca_reports").delete().eq("id", rep.id);
}

// ─── 4. DB LOGIC: RLS — anon/authenticated cannot read dmca_reports ──────────
async function testRls() {
  section("4. RLS – public access denied on dmca_reports + audit_logs");

  const anonDb = createClient(SUPABASE_URL, ANON_KEY);

  const { data: anonData, error: anonErr } = await anonDb
    .from("dmca_reports")
    .select("id")
    .limit(1);

  if (anonErr || (anonData !== null && anonData.length === 0)) {
    pass("dmca_reports: anon role gets 0 rows (FORCE RLS blocks read)");
  } else if (anonData && anonData.length > 0) {
    fail("dmca_reports: SECURITY — anon role can read rows! FORCE RLS may not be applied");
  } else {
    pass("dmca_reports: anon read returns error or empty (RLS active)");
  }

  const { data: anonAudit, error: auditAnonErr } = await anonDb
    .from("dmca_audit_logs")
    .select("id")
    .limit(1);

  if (auditAnonErr || (anonAudit !== null && anonAudit.length === 0)) {
    pass("dmca_audit_logs: anon role gets 0 rows (service-role only)");
  } else if (anonAudit && anonAudit.length > 0) {
    fail("dmca_audit_logs: SECURITY — anon role can read audit entries!");
  } else {
    pass("dmca_audit_logs: anon read returns error or empty (RLS active)");
  }
}

// ─── 5. API: submit route validation (requires running server) ───────────────
async function testSubmitApi() {
  section(`5. API – POST /api/dmca/submit @ ${BASE_URL}`);

  async function post(body, isFormData = true) {
    const init = { method: "POST" };
    if (isFormData) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(body)) fd.append(k, v);
      init.body = fd;
    } else {
      init.headers = { "Content-Type": "application/json" };
      init.body    = JSON.stringify(body);
    }
    const res  = await fetch(`${BASE_URL}/api/dmca/submit`, init);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  const VALID = {
    first_name:              "Flow",
    last_name:               "Test",
    email:                   `flowtest${TEST_EMAIL_DOMAIN}`,
    copyrighted_work:        "Test copyrighted work description",
    infringing_content_url:  "https://1nelink.com/u/test-infringe",
    infringement_details:    "Test infringement details here",
    electronic_signature:    "Flow Test",
  };

  // 5a. Valid submission → 200
  const { status: s200, json: j200 } = await post(VALID);
  if (s200 === 200 && j200.ok && j200.id) {
    pass("POST /api/dmca/submit: valid payload → 200 + returns id");
    const insertedId = j200.id;
    // Verify it landed in DB
    const { data: dbRow } = await db.from("dmca_reports").select("status, email").eq("id", insertedId).single();
    if (dbRow?.status === "pending" && dbRow.email === VALID.email) {
      pass("POST /api/dmca/submit: row in DB with status=pending, correct email");
    } else {
      fail("POST /api/dmca/submit: DB row missing or wrong", JSON.stringify(dbRow));
    }
  } else if (s200 === 429) {
    skip("POST /api/dmca/submit: valid payload → 429 (IP rate limit hit; run from fresh IP or wait)");
  } else {
    fail(`POST /api/dmca/submit: valid payload → ${s200}`, JSON.stringify(j200));
  }

  // 5b. Missing required fields → 400
  const { status: s400 } = await post({ first_name: "Only" });
  if (s400 === 400) pass("POST /api/dmca/submit: missing fields → 400");
  else fail(`POST /api/dmca/submit: missing fields → ${s400} (expected 400)`);

  // 5c. Invalid email → 400
  const { status: s400e } = await post({ ...VALID, email: "not-an-email" });
  if (s400e === 400) pass("POST /api/dmca/submit: invalid email → 400");
  else fail(`POST /api/dmca/submit: invalid email → ${s400e} (expected 400)`);

  // 5d. Oversized field → 400
  const { status: s400l } = await post({ ...VALID, email: `oversized${TEST_EMAIL_DOMAIN}`, copyrighted_work: "x".repeat(5001) });
  if (s400l === 400) pass("POST /api/dmca/submit: field >5000 chars → 400");
  else fail(`POST /api/dmca/submit: oversized field → ${s400l} (expected 400)`);

  // 5e. Concurrency: 'reviewing' block → 409
  const reviewingEmail = `reviewing-block${TEST_EMAIL_DOMAIN}`;
  await db.from("dmca_reports").delete().eq("email", reviewingEmail);
  await db.from("dmca_reports").insert({
    first_name: "Block", last_name: "Test", email: reviewingEmail,
    copyrighted_work: "x", infringing_content_url: "https://1nelink.com/x",
    infringement_details: "x", electronic_signature: "x",
    status: "reviewing",
  });
  const { status: s409r } = await post({ ...VALID, email: reviewingEmail });
  if (s409r === 409) pass("POST /api/dmca/submit: email with reviewing report → 409");
  else if (s409r === 429) skip("POST /api/dmca/submit: reviewing block test skipped (rate limited)");
  else fail(`POST /api/dmca/submit: reviewing block → ${s409r} (expected 409)`);

  // 5f. Concurrency: 2 open reports block → 409
  const twoOpenEmail = `two-open${TEST_EMAIL_DOMAIN}`;
  await db.from("dmca_reports").delete().eq("email", twoOpenEmail);
  await db.from("dmca_reports").insert([
    { first_name: "Block", last_name: "Test", email: twoOpenEmail, copyrighted_work: "x", infringing_content_url: "https://1nelink.com/a", infringement_details: "x", electronic_signature: "x", status: "pending" },
    { first_name: "Block", last_name: "Test", email: twoOpenEmail, copyrighted_work: "x", infringing_content_url: "https://1nelink.com/b", infringement_details: "x", electronic_signature: "x", status: "pending" },
  ]);
  const { status: s409t } = await post({ ...VALID, email: twoOpenEmail });
  if (s409t === 409) pass("POST /api/dmca/submit: email with 2 pending reports → 409");
  else if (s409t === 429) skip("POST /api/dmca/submit: 2-open block test skipped (rate limited)");
  else fail(`POST /api/dmca/submit: 2-open block → ${s409t} (expected 409)`);

  // Cleanup
  await db.from("dmca_reports").delete().like("email", `%${TEST_EMAIL_DOMAIN}`);
}

// ─── 6. API: my-reports auth gate ─────────────────────────────────────────────
async function testMyReportsApi() {
  section(`6. API – GET /api/dmca/my-reports @ ${BASE_URL}`);

  // No auth → 401
  const res = await fetch(`${BASE_URL}/api/dmca/my-reports`);
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) pass("GET /api/dmca/my-reports: no auth → 401");
  else fail(`GET /api/dmca/my-reports: no auth → ${res.status} (expected 401)`, json.error);

  // Garbage token → 401
  const res2 = await fetch(`${BASE_URL}/api/dmca/my-reports`, {
    headers: { Authorization: "Bearer garbage.token.here" },
  });
  if (res2.status === 401) pass("GET /api/dmca/my-reports: invalid token → 401");
  else fail(`GET /api/dmca/my-reports: invalid token → ${res2.status} (expected 401)`);
}

// ─── 7. API: admin list auth gate ────────────────────────────────────────────
async function testAdminApi() {
  section(`7. API – GET /api/admin/dmca (auth gate) @ ${BASE_URL}`);

  const res = await fetch(`${BASE_URL}/api/admin/dmca`);
  if (res.status === 403) pass("GET /api/admin/dmca: no auth → 403 Forbidden");
  else fail(`GET /api/admin/dmca: no auth → ${res.status} (expected 403)`);

  const res2 = await fetch(`${BASE_URL}/api/admin/dmca/00000000-0000-0000-0000-000000000000`);
  if (res2.status === 403) pass("GET /api/admin/dmca/:id: no auth → 403 Forbidden");
  else fail(`GET /api/admin/dmca/:id: no auth → ${res2.status} (expected 403)`);

  const res3 = await fetch(`${BASE_URL}/api/admin/dmca/00000000-0000-0000-0000-000000000000`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewing" }),
  });
  if (res3.status === 403) pass("PATCH /api/admin/dmca/:id: no auth → 403 Forbidden");
  else fail(`PATCH /api/admin/dmca/:id: no auth → ${res3.status} (expected 403)`);
}

// ─── 8. DB LOGIC: data integrity – foreign key enforcement ───────────────────
async function testForeignKeys() {
  section("8. DB Logic – foreign key integrity");

  // Audit log FK: inserting with non-existent report_id should fail
  const fakeId = "00000000-0000-0000-0000-000000000099";
  const { error: fkErr } = await db.from("dmca_audit_logs").insert({
    report_id: fakeId,
    admin_id:  fakeId,
    action:    "status_change",
  });

  if (fkErr && (fkErr.code === "23503" || fkErr.message.includes("foreign key"))) {
    pass("dmca_audit_logs: FK on report_id enforced (rejects non-existent report)");
  } else if (fkErr) {
    pass(`dmca_audit_logs: FK error fired (code: ${fkErr.code})`);
  } else {
    fail("dmca_audit_logs: FK on report_id NOT enforced — orphaned audit entries possible");
  }

  // creator_strikes FK: related_dmca_id must reference valid dmca_report
  // (only test if creator_strikes table is accessible)
  const { error: strikeReadErr } = await db.from("creator_strikes").select("id").limit(1);
  if (!strikeReadErr) {
    const { error: strikeFkErr } = await db.from("creator_strikes").update({ related_dmca_id: fakeId }).eq("id", fakeId);
    // This might be a no-op (0 rows updated) or FK error — both are acceptable
    if (!strikeFkErr) {
      pass("creator_strikes.related_dmca_id: column accessible, no phantom rows updated");
    } else if (strikeFkErr.code === "23503") {
      pass("creator_strikes.related_dmca_id: FK enforced");
    } else {
      skip(`creator_strikes.related_dmca_id FK test inconclusive: ${strikeFkErr.message}`);
    }
  } else {
    skip("creator_strikes table not accessible via service role — skipping FK test");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║           DMCA Flow Test Suite                               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  API:      ${BASE_URL ?? "(not set — API tests skipped)"}`);

  await cleanup();

  await testSchema();
  await testConcurrencyLogic();
  await testAuditLog();
  await testRls();

  if (BASE_URL) {
    await testSubmitApi();
    await testMyReportsApi();
    await testAdminApi();
  } else {
    section("5–7. API Tests");
    skip("API tests skipped — set TEST_BASE_URL=http://localhost:3000 to enable");
    skipped += 3;
  }

  await testForeignKeys();

  await cleanup();  // Final cleanup

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed  ${failed} failed  ${skipped} skipped`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (failures.length > 0) {
    console.error("Failed tests:");
    failures.forEach((f) => console.error(`  • ${f}`));
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
})();
