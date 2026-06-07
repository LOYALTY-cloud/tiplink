#!/usr/bin/env node
/**
 * Queue Entry Notification — Test Suite
 *
 * Verifies:
 *   1. Source audit — notification only in market-active (not in upload)
 *   2. Notification targets correct roles
 *   3. Only fires on active=true (not on deactivate)
 *   4. API gate — market-active requires auth
 *   5. DB check — admin_notifications table exists + reachable
 *   6. No notification in upload route (upload-only themes don't ping admins)
 *
 * Usage:
 *   TEST_BASE_URL=http://localhost:3000 node --env-file=.env.local dev-tools/tests/test-queue-notification.cjs
 */
"use strict";

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

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL         = process.env.TEST_BASE_URL || null;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.error("❌  Missing Supabase env vars"); process.exit(1); }

const { createClient } = require("@supabase/supabase-js");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0, failed = 0;
const failures = [];

function pass(msg)              { passed++;  console.log(`  ✅ ${msg}`); }
function fail(msg, detail = "") {
  failed++;
  failures.push(`${msg}${detail ? `: ${detail}` : ""}`);
  console.error(`  ❌ ${msg}${detail ? ` — ${detail}` : ""}`);
}
function section(s)  { console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}\n`); }

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SOURCE AUDIT — notification only fires on activate-for-sale
// ═══════════════════════════════════════════════════════════════════════════════
function test1_sourceAudit() {
  section("1. Source Audit — notification gating");

  const marketActiveSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/themes/market-active/route.ts"), "utf-8"
  );
  const uploadSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/marketplace/upload/route.ts"), "utf-8"
  );

  // market-active must import and call createAdminNotification
  if (marketActiveSrc.includes("createAdminNotification"))
    pass("market-active imports createAdminNotification");
  else
    fail("market-active missing createAdminNotification import");

  // Must be gated on active === true
  if (marketActiveSrc.includes("if (active)") && marketActiveSrc.includes("createAdminNotification"))
    pass("Notification gated on active=true only (not on deactivate)");
  else
    fail("Notification not properly gated on active=true");

  // upload route must NOT call createAdminNotification
  if (!uploadSrc.includes("createAdminNotification"))
    pass("upload route does NOT call createAdminNotification (upload-only themes don't notify)");
  else
    fail("upload route still calls createAdminNotification — should be removed");

  // Must target correct roles
  const expectedRoles = ["owner", "co_owner", "super_admin", "admin", "moderator"];
  for (const role of expectedRoles) {
    if (marketActiveSrc.includes(`"${role}"`))
      pass(`Role target includes "${role}"`);
    else
      fail(`Role target missing "${role}"`);
  }

  // queue_entered_at must be set on activate
  if (marketActiveSrc.includes("queue_entered_at: new Date().toISOString()"))
    pass("queue_entered_at stamped on activate");
  else
    fail("queue_entered_at not stamped on activate");

  // queue_entered_at must be cleared on deactivate
  if (marketActiveSrc.includes("queue_entered_at: null"))
    pass("queue_entered_at cleared on deactivate");
  else
    fail("queue_entered_at not cleared on deactivate");

  // notification type is marketplace_alert
  if (marketActiveSrc.includes('"marketplace_alert"'))
    pass('Notification type is "marketplace_alert"');
  else
    fail("Notification type is not marketplace_alert");

  // links to /admin/marketplace
  if (marketActiveSrc.includes('"/admin/marketplace"'))
    pass("Notification links to /admin/marketplace");
  else
    fail("Notification does not link to /admin/marketplace");

  // requiresAction: true
  if (marketActiveSrc.includes("requiresAction: true"))
    pass("requiresAction: true on notification");
  else
    fail("requiresAction not set to true");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DB — admin_notifications table reachable
// ═══════════════════════════════════════════════════════════════════════════════
async function test2_db() {
  section("2. DB — admin_notifications table");

  const { data, error } = await db
    .from("admin_notifications")
    .select("id, type, role_target, requires_action, link, created_at")
    .eq("type", "marketplace_alert")
    .eq("link", "/admin/marketplace")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    fail("admin_notifications table query failed", error.message);
    return;
  }

  pass("admin_notifications table reachable");

  if (data && data.length > 0) {
    pass(`Found ${data.length} recent marketplace_alert notification(s)`);
    const latest = data[0];
    if (latest.role_target && Array.isArray(latest.role_target)) {
      const hasModerator = latest.role_target.includes("moderator");
      const hasAdmin     = latest.role_target.includes("admin");
      if (hasModerator) pass("Latest marketplace_alert targets 'moderator' role");
      else fail("Latest marketplace_alert missing 'moderator' in role_target", JSON.stringify(latest.role_target));
      if (hasAdmin) pass("Latest marketplace_alert targets 'admin' role");
      else fail("Latest marketplace_alert missing 'admin' in role_target", JSON.stringify(latest.role_target));
    }
    if (latest.requires_action)
      pass("Latest marketplace_alert has requires_action=true");
    else
      fail("Latest marketplace_alert missing requires_action");
    if (latest.link === "/admin/marketplace")
      pass("Latest marketplace_alert links to /admin/marketplace");
    else
      fail("Latest marketplace_alert wrong link", latest.link);
  } else {
    pass("No marketplace_alert notifications yet — will be created on first theme activation");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. API GATE — market-active requires auth
// ═══════════════════════════════════════════════════════════════════════════════
async function test3_apiGate() {
  if (!BASE_URL) {
    console.log("\n── 3. API Gate — skipped (no TEST_BASE_URL) ────────────────\n");
    return;
  }

  section(`3. API Gate — POST /api/themes/market-active @ ${BASE_URL}`);

  // No auth
  const r1 = await fetch(`${BASE_URL}/api/themes/market-active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_id: "fake-id", active: true }),
  });
  if (r1.status === 401 || r1.status === 403)
    pass(`No auth → ${r1.status} (blocked)`);
  else
    fail(`No auth should return 401/403`, `got ${r1.status}`);

  // Missing theme_id
  const r2 = await fetch(`${BASE_URL}/api/themes/market-active`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer invalid" },
    body: JSON.stringify({ active: true }),
  });
  if (r2.status === 401 || r2.status === 400)
    pass(`Missing theme_id → ${r2.status} (blocked)`);
  else
    fail("Missing theme_id should be rejected", `got ${r2.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STALE CRON SOURCE CHECK
// ═══════════════════════════════════════════════════════════════════════════════
function test4_cronAudit() {
  section("4. Stale Queue Cron — source + vercel.json");

  const cronSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/cron/stale-queue-themes/route.ts"), "utf-8"
  );
  const vercelJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf-8"));

  if (cronSrc.includes("STALE_HOURS = 48"))
    pass("Stale threshold = 48 hours");
  else
    fail("STALE_HOURS not set to 48");

  if (cronSrc.includes("status: \"draft\""))
    pass("Auto-removed themes set to draft");
  else
    fail("Auto-removed themes not set to draft");

  if (cronSrc.includes("is_public: false") && cronSrc.includes("is_market_active: false"))
    pass("Auto-removed themes set is_public=false, is_market_active=false");
  else
    fail("Auto-removed themes missing is_public/is_market_active reset");

  if (cronSrc.includes("marketplace_theme_auto_removed"))
    pass("Auto-remove logs marketplace_theme_auto_removed to admin_actions");
  else
    fail("Missing admin_actions log for auto-remove");

  if (cronSrc.includes("createNotification"))
    pass("Creator notified in-app on auto-remove");
  else
    fail("Creator not notified on auto-remove");

  if (cronSrc.includes("createAdminNotification"))
    pass("Owner notified via admin notification on auto-remove");
  else
    fail("Owner not notified on auto-remove");

  const cronEntry = vercelJson.crons?.find((c) => c.path === "/api/cron/stale-queue-themes");
  if (cronEntry)
    pass(`Cron registered in vercel.json (schedule: ${cronEntry.schedule})`);
  else
    fail("Cron not registered in vercel.json");
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Queue Entry Notification & Stale Cron — Test Suite     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  test1_sourceAudit();
  await test2_db();
  await test3_apiGate();
  test4_cronAudit();

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Failed tests:");
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log("─────────────────────────────────────────────────────────────\n");

  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
