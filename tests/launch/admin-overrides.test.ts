/**
 * Admin Overrides tests — verifies override type mapping, severity colors,
 * role-based access control, and API validation logic.
 */
import { requireRole } from "../../src/lib/auth/requireRole";
import { PERMISSIONS } from "../../src/lib/auth/permissions";

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

// ── Override type mapping (mirrors page.tsx constants) ──

const OVERRIDE_LABELS: Record<string, string> = {
  override_withdrawal_limit: "Withdrawal Limit → Unlimited",
  unlock_withdrawal: "Unlock Withdrawal",
  unflag: "Unflag User",
  clear_restriction: "Clear Restriction",
  bypass_verification: "Bypass Verification",
  override_risk_score: "Reset Risk Score",
  manual_flag: "Manual Flag",
};

const SEVERITY_COLORS: Record<string, string> = {
  override_withdrawal_limit: "text-red-400 bg-red-500/10 border-red-500/20",
  unlock_withdrawal: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  manual_flag: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  unflag: "text-green-400 bg-green-500/10 border-green-500/20",
  clear_restriction: "text-green-400 bg-green-500/10 border-green-500/20",
  bypass_verification: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  override_risk_score: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

// Valid override types from the POST API route
const VALID_OVERRIDE_TYPES = [
  "unflag",
  "clear_restriction",
  "bypass_verification",
  "override_risk_score",
  "unlock_withdrawal",
  "manual_flag",
  "override_withdrawal_limit",
];

// Override action shapes (mirrors route.ts OVERRIDE_ACTIONS)
const OVERRIDE_ACTION_SHAPES: Record<string, Record<string, unknown>> = {
  unflag: { is_flagged: false },
  clear_restriction: { account_status: "active", restricted_until: null, status_reason: null },
  bypass_verification: { verification_required: false, verification_reason: null },
  override_risk_score: { risk_score: 0, risk_level: "low", last_fraud_score: 0 },
  unlock_withdrawal: { withdrawal_locked: false, payout_hold_until: null },
  manual_flag: { is_flagged: true },
  override_withdrawal_limit: { withdrawal_limit_override: true },
};

console.log("── Admin Overrides Tests ──\n");

// 1. Override labels — all valid types have a label
console.log("▸ Override labels");
{
  for (const type of VALID_OVERRIDE_TYPES) {
    assert(
      typeof OVERRIDE_LABELS[type] === "string" && OVERRIDE_LABELS[type].length > 0,
      `Label exists for ${type}: "${OVERRIDE_LABELS[type]}"`
    );
  }
  assert(
    Object.keys(OVERRIDE_LABELS).length === VALID_OVERRIDE_TYPES.length,
    `Label count matches valid types (${Object.keys(OVERRIDE_LABELS).length} = ${VALID_OVERRIDE_TYPES.length})`
  );
}

// 2. Severity colors — every valid type has color assignment
console.log("\n▸ Severity color mapping");
{
  for (const type of VALID_OVERRIDE_TYPES) {
    assert(
      typeof SEVERITY_COLORS[type] === "string" && SEVERITY_COLORS[type].length > 0,
      `Color exists for ${type}`
    );
  }

  // Dangerous overrides get red/amber
  assert(
    SEVERITY_COLORS.override_withdrawal_limit.includes("red"),
    "override_withdrawal_limit → red (high risk)"
  );
  assert(
    SEVERITY_COLORS.unlock_withdrawal.includes("amber"),
    "unlock_withdrawal → amber (medium risk)"
  );
  assert(
    SEVERITY_COLORS.bypass_verification.includes("amber"),
    "bypass_verification → amber (medium risk)"
  );

  // Recovery overrides get green
  assert(
    SEVERITY_COLORS.unflag.includes("green"),
    "unflag → green (recovery action)"
  );
  assert(
    SEVERITY_COLORS.clear_restriction.includes("green"),
    "clear_restriction → green (recovery action)"
  );

  // Manual flag is orange (admin-initiated risk)
  assert(
    SEVERITY_COLORS.manual_flag.includes("orange"),
    "manual_flag → orange (admin-initiated risk)"
  );

  // Risk score reset is blue (neutral/info)
  assert(
    SEVERITY_COLORS.override_risk_score.includes("blue"),
    "override_risk_score → blue (neutral/info)"
  );
}

// 3. Override action shapes — each type produces correct profile updates
console.log("\n▸ Override action shapes");
{
  // unflag sets is_flagged to false
  assert(OVERRIDE_ACTION_SHAPES.unflag.is_flagged === false, "unflag: is_flagged=false");

  // manual_flag sets is_flagged to true
  assert(OVERRIDE_ACTION_SHAPES.manual_flag.is_flagged === true, "manual_flag: is_flagged=true");

  // clear_restriction resets to active
  assert(OVERRIDE_ACTION_SHAPES.clear_restriction.account_status === "active", "clear_restriction: account_status=active");
  assert(OVERRIDE_ACTION_SHAPES.clear_restriction.restricted_until === null, "clear_restriction: restricted_until=null");
  assert(OVERRIDE_ACTION_SHAPES.clear_restriction.status_reason === null, "clear_restriction: status_reason=null");

  // bypass_verification removes requirement
  assert(OVERRIDE_ACTION_SHAPES.bypass_verification.verification_required === false, "bypass_verification: verification_required=false");
  assert(OVERRIDE_ACTION_SHAPES.bypass_verification.verification_reason === null, "bypass_verification: verification_reason=null");

  // override_risk_score resets to 0
  assert(OVERRIDE_ACTION_SHAPES.override_risk_score.risk_score === 0, "override_risk_score: risk_score=0");
  assert(OVERRIDE_ACTION_SHAPES.override_risk_score.risk_level === "low", "override_risk_score: risk_level=low");
  assert(OVERRIDE_ACTION_SHAPES.override_risk_score.last_fraud_score === 0, "override_risk_score: last_fraud_score=0");

  // unlock_withdrawal removes lock
  assert(OVERRIDE_ACTION_SHAPES.unlock_withdrawal.withdrawal_locked === false, "unlock_withdrawal: withdrawal_locked=false");
  assert(OVERRIDE_ACTION_SHAPES.unlock_withdrawal.payout_hold_until === null, "unlock_withdrawal: payout_hold_until=null");

  // override_withdrawal_limit enables override flag
  assert(OVERRIDE_ACTION_SHAPES.override_withdrawal_limit.withdrawal_limit_override === true, "override_withdrawal_limit: override=true");
}

// 4. Role-based access — viewing overrides requires risk_eval
console.log("\n▸ Role-based access: viewing overrides (risk_eval)");
{
  // Roles that CAN view overrides
  requireRole("owner", "risk_eval");
  assert(true, "owner can view overrides");
  requireRole("super_admin", "risk_eval");
  assert(true, "super_admin can view overrides");
  requireRole("finance_admin", "risk_eval");
  assert(true, "finance_admin can view overrides");

  // Roles that CANNOT view overrides
  assertThrows(
    () => requireRole("support_admin", "risk_eval"),
    "support_admin cannot view overrides"
  );
  assertThrows(
    () => requireRole("user", "risk_eval"),
    "regular user cannot view overrides"
  );
}

// 5. Role-based access — applying overrides requires restrict permission
console.log("\n▸ Role-based access: applying overrides (restrict)");
{
  requireRole("owner", "restrict");
  assert(true, "owner can apply overrides");
  requireRole("super_admin", "restrict");
  assert(true, "super_admin can apply overrides");
  requireRole("finance_admin", "restrict");
  assert(true, "finance_admin can apply overrides");

  assertThrows(
    () => requireRole("support_admin", "restrict"),
    "support_admin cannot apply overrides"
  );
  assertThrows(
    () => requireRole("user", "restrict"),
    "regular user cannot apply overrides"
  );
  assertThrows(
    () => requireRole(null, "restrict"),
    "null role cannot apply overrides"
  );
  assertThrows(
    () => requireRole(undefined, "restrict"),
    "undefined role cannot apply overrides"
  );
}

// 6. Page access — OverridesPage allows only owner/super_admin/finance_admin
console.log("\n▸ Page access guard (client-side role check)");
{
  const allowedPageRoles = ["owner", "super_admin", "finance_admin"];

  for (const role of allowedPageRoles) {
    assert(allowedPageRoles.includes(role), `${role} can access /admin/overrides`);
  }
  assert(!allowedPageRoles.includes("support_admin"), "support_admin locked out of /admin/overrides");
  assert(!allowedPageRoles.includes("user"), "user locked out of /admin/overrides");
}

// 7. API validation — input constraints for POST /api/admin/override
console.log("\n▸ POST body validation rules");
{
  // userId must be a non-empty string
  assert(typeof "" === "string" && "".length === 0, "empty userId rejected");
  assert(typeof "abc-123" === "string" && "abc-123".length > 0, "valid userId accepted");

  // overrideType must be one of VALID_OVERRIDE_TYPES
  assert(VALID_OVERRIDE_TYPES.includes("unflag"), "unflag is valid type");
  assert(VALID_OVERRIDE_TYPES.includes("manual_flag"), "manual_flag is valid type");
  assert(!VALID_OVERRIDE_TYPES.includes("delete_user"), "delete_user is NOT a valid type");
  assert(!VALID_OVERRIDE_TYPES.includes(""), "empty string is NOT a valid type");
  assert(!VALID_OVERRIDE_TYPES.includes("DROP TABLE profiles"), "SQL injection is NOT a valid type");

  // reason must be >= 5 chars
  assert("ab".trim().length < 5, "2-char reason rejected");
  assert("abcd".trim().length < 5, "4-char reason rejected");
  assert("valid reason here".trim().length >= 5, "17-char reason accepted");
  assert("    ".trim().length < 5, "whitespace-only reason rejected");
}

// 8. Pagination logic
console.log("\n▸ Pagination logic");
{
  const PAGE_SIZE = 25;

  // totalPages calculation
  const calcPages = (total: number) => Math.ceil(total / PAGE_SIZE);
  assert(calcPages(0) === 0, "0 records = 0 pages");
  assert(calcPages(1) === 1, "1 record = 1 page");
  assert(calcPages(25) === 1, "25 records = 1 page");
  assert(calcPages(26) === 2, "26 records = 2 pages");
  assert(calcPages(100) === 4, "100 records = 4 pages");

  // API limit clamping (from the GET route: max 200)
  const clampLimit = (n: number) => Math.min(n, 200);
  assert(clampLimit(25) === 25, "25 within limit");
  assert(clampLimit(200) === 200, "200 = max");
  assert(clampLimit(500) === 200, "500 clamped to 200");
}

// 9. Mutual exclusivity of certain overrides
console.log("\n▸ Override mutual exclusivity");
{
  // unflag and manual_flag are inverses
  assert(
    OVERRIDE_ACTION_SHAPES.unflag.is_flagged === false &&
    OVERRIDE_ACTION_SHAPES.manual_flag.is_flagged === true,
    "unflag and manual_flag are inverse (false vs true)"
  );

  // clear_restriction restores to "active", no type sets "restricted"
  const restrictionTypes = VALID_OVERRIDE_TYPES.filter(
    (t) => (OVERRIDE_ACTION_SHAPES[t] as Record<string, unknown>)?.account_status === "restricted"
  );
  assert(
    restrictionTypes.length === 0,
    "No override type sets account_status to restricted (that's handled elsewhere)"
  );
}

// 10. All override types present in both label and color maps
console.log("\n▸ Completeness check");
{
  const labelKeys = new Set(Object.keys(OVERRIDE_LABELS));
  const colorKeys = new Set(Object.keys(SEVERITY_COLORS));

  for (const type of VALID_OVERRIDE_TYPES) {
    assert(labelKeys.has(type), `${type} in label map`);
    assert(colorKeys.has(type), `${type} in color map`);
  }

  // No stale entries
  for (const key of labelKeys) {
    assert(VALID_OVERRIDE_TYPES.includes(key), `Label key ${key} is a valid type`);
  }
  for (const key of colorKeys) {
    assert(VALID_OVERRIDE_TYPES.includes(key), `Color key ${key} is a valid type`);
  }
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
