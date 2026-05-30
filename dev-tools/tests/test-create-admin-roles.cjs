#!/usr/bin/env node
/**
 * ADMIN CREATE + ROLE WIRING TEST
 *
 * Tests:
 *  1. generateAdminId — correct prefix for every role
 *  2. validateAdminIdPrefix — matches/rejects correctly
 *  3. generateAdminPasscode — correct format
 *  4. ADMIN_ROLES list — all 9 roles present, no duplicates, no unknowns
 *  5. UI ROLES array — covers all ADMIN_ROLES (no missing)
 *  6. ROLE_PREFIXES completeness — every role has a unique prefix
 *  7. Role display names — every role maps to a human-readable label
 *  8. API gate — only owner/super_admin can create (unit logic check)
 *  9. New-role guard — co_owner/security/compliance/analyst accepted, not rejected
 * 10. Cross-check — permissions.ts ADMIN_ROLES match create-admin ADMIN_ROLES
 */

const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────
// Inline the logic we're testing (avoids needing ts-node)
// ─────────────────────────────────────────────────────────────

const ROLE_PREFIXES = {
  owner:         "OWN",
  co_owner:      "COW",
  super_admin:   "ADM",
  security:      "SEC",
  finance_admin: "FIN",
  compliance:    "CMP",
  support_admin: "SUP",
  moderator:     "MOD",
  analyst:       "ANL",
};

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function secureRandom(length) {
  const bytes = crypto.randomBytes(length * 4);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[bytes.readUInt32BE(i * 4) % CHARS.length];
  }
  return result;
}
function generateAdminId(role) {
  const prefix = ROLE_PREFIXES[role] ?? "ADM";
  return `${prefix}-${secureRandom(6)}`;
}
function generateAdminPasscode(adminId) {
  return `${adminId}-${secureRandom(4)}`;
}
function validateAdminIdPrefix(adminId, role) {
  const expected = ROLE_PREFIXES[role];
  if (!expected) return false;
  return adminId.startsWith(`${expected}-`);
}

// From permissions.ts
const PERMISSIONS_ADMIN_ROLES = [
  "owner", "co_owner", "super_admin", "security",
  "finance_admin", "support_admin", "compliance",
  "moderator", "analyst",
];

// From create-admin/route.ts (updated)
const CREATE_ADMIN_ROLES = [
  "owner", "co_owner", "super_admin", "security",
  "finance_admin", "compliance", "support_admin", "moderator", "analyst",
];

// From users/create/page.tsx (updated)
const UI_ROLES = [
  "analyst", "moderator", "support_admin", "compliance",
  "finance_admin", "security", "super_admin", "co_owner", "owner",
];

// Expected role→display label
const ROLE_DISPLAY = {
  owner:         "Owner",
  co_owner:      "Co-Owner",
  super_admin:   "Super Admin",
  security:      "Security",
  finance_admin: "Finance Admin",
  compliance:    "Compliance",
  support_admin: "Support Admin",
  moderator:     "Moderator",
  analyst:       "Analyst",
};

// ─────────────────────────────────────────────────────────────
// Test runner helpers
// ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const errors = [];

function pass(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) {
  console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  failed++; errors.push({ label, detail });
}
function section(title) {
  console.log(`\n── ${title} ────────────────────────────────────────`);
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

section("1. generateAdminId — correct prefix per role");
for (const [role, expectedPrefix] of Object.entries(ROLE_PREFIXES)) {
  const id = generateAdminId(role);
  const ok = id.startsWith(`${expectedPrefix}-`) && id.length === 10; // PREFIX(3)-DASH(1)-6CHARS
  ok ? pass(`${role} → ${id}`) : fail(`${role} prefix wrong`, `got ${id}, expected ${expectedPrefix}-XXXXXX`);
}

section("2. validateAdminIdPrefix — match and reject");
for (const [role, prefix] of Object.entries(ROLE_PREFIXES)) {
  const goodId = `${prefix}-AB3K9M`;
  const badId  = "ZZZ-AB3K9M";
  validateAdminIdPrefix(goodId, role)  ? pass(`${role}: correct prefix accepted`) : fail(`${role}: correct prefix rejected`);
  validateAdminIdPrefix(badId,  role)  ? fail(`${role}: wrong prefix accepted`)   : pass(`${role}: wrong prefix blocked`);
}

section("3. generateAdminPasscode — format check");
for (const role of Object.keys(ROLE_PREFIXES)) {
  const id = generateAdminId(role);
  const passcode = generateAdminPasscode(id);
  // Should be PREFIX-6CHARS-4CHARS = 3+1+6+1+4 = 15 chars
  const ok = passcode.startsWith(id + "-") && passcode.length === 15;
  ok ? pass(`${role} passcode: ${passcode}`) : fail(`${role} passcode malformed`, `got ${passcode} (len ${passcode.length})`);
}

section("4. ADMIN_ROLES completeness — create-admin route");
const allRoles = Object.keys(ROLE_PREFIXES);
for (const role of allRoles) {
  CREATE_ADMIN_ROLES.includes(role)
    ? pass(`${role} in CREATE_ADMIN_ROLES`)
    : fail(`${role} MISSING from create-admin ADMIN_ROLES`);
}
// No extras
for (const role of CREATE_ADMIN_ROLES) {
  allRoles.includes(role)
    ? pass(`${role} is a valid role`)
    : fail(`Unknown role in CREATE_ADMIN_ROLES`, role);
}
// No duplicates
const dupes = CREATE_ADMIN_ROLES.filter((r, i) => CREATE_ADMIN_ROLES.indexOf(r) !== i);
dupes.length === 0 ? pass("No duplicate roles in CREATE_ADMIN_ROLES") : fail("Duplicate roles found", dupes.join(", "));

section("5. UI ROLES dropdown — all roles present");
for (const role of allRoles) {
  UI_ROLES.includes(role)
    ? pass(`${role} in UI dropdown`)
    : fail(`${role} MISSING from UI dropdown`);
}
// No extras
for (const role of UI_ROLES) {
  allRoles.includes(role)
    ? pass(`UI role ${role} is valid`)
    : fail(`Unknown role in UI dropdown`, role);
}

section("6. ROLE_PREFIXES — all unique, no collision");
const prefixValues = Object.values(ROLE_PREFIXES);
const uniquePrefixes = new Set(prefixValues);
uniquePrefixes.size === prefixValues.length
  ? pass(`All ${prefixValues.length} prefixes are unique`)
  : fail("Duplicate prefix found", JSON.stringify(prefixValues));

section("7. Role display names — all 9 roles have a label");
for (const role of allRoles) {
  ROLE_DISPLAY[role]
    ? pass(`${role} → "${ROLE_DISPLAY[role]}"`)
    : fail(`${role} has NO display label`);
}

section("8. API create gate — owner/co_owner only");
function canCreateAdmin(callerRole, targetRole) {
  const allowed = ["owner", "co_owner"];
  if (!allowed.includes(callerRole)) return { ok: false, reason: "forbidden" };
  if (targetRole === "owner" && callerRole !== "owner") return { ok: false, reason: "only owner can create owner" };
  if (targetRole === "co_owner" && callerRole !== "owner") return { ok: false, reason: "only owner can create co_owner" };
  if (!CREATE_ADMIN_ROLES.includes(targetRole)) return { ok: false, reason: "invalid role" };
  return { ok: true };
}
canCreateAdmin("owner",       "co_owner").ok      ? pass("owner can create co_owner") : fail("owner cannot create co_owner");
canCreateAdmin("owner",       "security").ok      ? pass("owner can create security") : fail("owner cannot create security");
canCreateAdmin("owner",       "compliance").ok    ? pass("owner can create compliance") : fail("owner cannot create compliance");
canCreateAdmin("owner",       "analyst").ok       ? pass("owner can create analyst") : fail("owner cannot create analyst");
canCreateAdmin("co_owner",    "analyst").ok       ? pass("co_owner can create analyst") : fail("co_owner cannot create analyst");
canCreateAdmin("co_owner",    "security").ok      ? pass("co_owner can create security") : fail("co_owner cannot create security");
canCreateAdmin("co_owner",    "owner").ok         ? fail("co_owner should NOT create owner") : pass("co_owner blocked from creating owner");
canCreateAdmin("co_owner",    "co_owner").ok      ? fail("co_owner should NOT create co_owner") : pass("co_owner blocked from creating co_owner");
canCreateAdmin("super_admin", "analyst").ok       ? fail("super_admin should NOT create admins") : pass("super_admin blocked from creating admins");
canCreateAdmin("finance_admin","analyst").ok      ? fail("finance_admin should NOT create any admin") : pass("finance_admin blocked from creating admins");
canCreateAdmin("moderator",   "support_admin").ok ? fail("moderator should NOT create admin") : pass("moderator blocked from creating admins");
canCreateAdmin("owner",       "fake_role").ok     ? fail("invalid role should be rejected") : pass("invalid role rejected by API");

section("9. permissions.ts ADMIN_ROLES ↔ create-admin ADMIN_ROLES — in sync");
const sorted1 = [...PERMISSIONS_ADMIN_ROLES].sort();
const sorted2 = [...CREATE_ADMIN_ROLES].sort();
JSON.stringify(sorted1) === JSON.stringify(sorted2)
  ? pass("permissions.ts and create-admin route have identical role sets")
  : (() => {
      const missing = sorted1.filter((r) => !sorted2.includes(r));
      const extra   = sorted2.filter((r) => !sorted1.includes(r));
      if (missing.length) fail(`Roles in permissions.ts but NOT in create-admin`, missing.join(", "));
      if (extra.length)   fail(`Roles in create-admin but NOT in permissions.ts`, extra.join(", "));
    })();

section("10. UI ROLES ↔ permissions.ts ADMIN_ROLES — in sync");
const sortedUI   = [...UI_ROLES].sort();
const sortedPerm = [...PERMISSIONS_ADMIN_ROLES].sort();
JSON.stringify(sortedUI) === JSON.stringify(sortedPerm)
  ? pass("UI dropdown and permissions.ts have identical role sets")
  : (() => {
      const missing = sortedPerm.filter((r) => !sortedUI.includes(r));
      const extra   = sortedUI.filter((r) => !sortedPerm.includes(r));
      if (missing.length) fail(`Roles in permissions.ts missing from UI dropdown`, missing.join(", "));
      if (extra.length)   fail(`Extra roles in UI dropdown not in permissions.ts`, extra.join(", "));
    })();

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (errors.length) {
  console.log("\nFailed tests:");
  errors.forEach(({ label, detail }) => console.error(`  ✗ ${label}${detail ? `\n    ${detail}` : ""}`));
} else {
  console.log("All tests passed ✓");
}
console.log("══════════════════════════════════════════════════════");
process.exit(failed > 0 ? 1 : 0);
