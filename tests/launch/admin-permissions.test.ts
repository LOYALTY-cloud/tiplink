/**
 * Admin permission tests — verifies role hierarchy and access control.
 */
import { requireRole } from "../../src/lib/auth/requireRole";
import { PERMISSIONS, ADMIN_ROLES } from "../../src/lib/auth/permissions";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

function assertThrows(fn: () => void, msg: string) {
  try { fn(); failed++; console.error(`  ❌ ${msg} (did NOT throw)`); }
  catch { passed++; console.log(`  ✅ ${msg}`); }
}

console.log("── Admin Permission Tests ──\n");

// 1. Owner can do everything
for (const perm of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
  try {
    requireRole("owner", perm);
    assert(true, `Owner: ${perm} ✓`);
  } catch {
    assert(false, `Owner should have ${perm}`);
  }
}

// 2. super_admin can do everything except manage_staff
{
  requireRole("super_admin", "refund");
  assert(true, `super_admin: refund ✓`);
  requireRole("super_admin", "restrict");
  assert(true, `super_admin: restrict ✓`);
  requireRole("super_admin", "panic");
  assert(true, `super_admin: panic ✓`);
  assertThrows(() => requireRole("super_admin", "manage_staff"), `super_admin: manage_staff ✗`);
}

// 3. finance_admin has limited permissions
{
  requireRole("finance_admin", "refund");
  assert(true, `finance_admin: refund ✓`);
  requireRole("finance_admin", "view_admin");
  assert(true, `finance_admin: view_admin ✓`);
  assertThrows(() => requireRole("finance_admin", "restrict"), `finance_admin: restrict ✗`);
  assertThrows(() => requireRole("finance_admin", "panic"), `finance_admin: panic ✗`);
  assertThrows(() => requireRole("finance_admin", "close"), `finance_admin: close ✗`);
  assertThrows(() => requireRole("finance_admin", "manage_staff"), `finance_admin: manage_staff ✗`);
}

// 4. support_admin has minimal permissions
{
  requireRole("support_admin", "view_admin");
  assert(true, `support_admin: view_admin ✓`);
  assertThrows(() => requireRole("support_admin", "refund"), `support_admin: refund ✗`);
  assertThrows(() => requireRole("support_admin", "restrict"), `support_admin: restrict ✗`);
  assertThrows(() => requireRole("support_admin", "close"), `support_admin: close ✗`);
  assertThrows(() => requireRole("support_admin", "manage_staff"), `support_admin: manage_staff ✗`);
}

// 5. Regular user has NO admin permissions
for (const perm of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
  assertThrows(() => requireRole("user", perm), `user: ${perm} ✗`);
}

// 6. Null/undefined role blocked
for (const perm of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
  assertThrows(() => requireRole(null, perm), `null role: ${perm} ✗`);
  assertThrows(() => requireRole(undefined, perm), `undefined role: ${perm} ✗`);
}

// 7. Custom permission list
{
  requireRole("owner", ["owner", "super_admin"]);
  assert(true, `Custom list: owner in [owner, super_admin] ✓`);
  assertThrows(() => requireRole("finance_admin", ["owner", "super_admin"]), `Custom list: finance_admin not in [owner, super_admin] ✗`);
}

// 8. ADMIN_ROLES contains expected roles
assert(ADMIN_ROLES.includes("owner"), `ADMIN_ROLES has owner`);
assert(ADMIN_ROLES.includes("super_admin"), `ADMIN_ROLES has super_admin`);
assert(ADMIN_ROLES.includes("finance_admin"), `ADMIN_ROLES has finance_admin`);
assert(ADMIN_ROLES.includes("support_admin"), `ADMIN_ROLES has support_admin`);
assert(!ADMIN_ROLES.includes("user"), `ADMIN_ROLES excludes user`);

// 9. No self-modification possible (verify manage_staff is owner-only)
assert(PERMISSIONS.manage_staff.length === 1, `manage_staff: owner-only (got ${PERMISSIONS.manage_staff.length} roles)`);
assert(PERMISSIONS.manage_staff[0] === "owner", `manage_staff[0] = owner`);

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
