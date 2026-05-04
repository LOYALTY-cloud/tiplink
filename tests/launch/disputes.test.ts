/**
 * Disputes page & warning logic tests — verifies severity classification,
 * admin warnings for disputed accounts, and fraud scoring for disputes.
 */
import { getAdminWarnings } from "../../src/lib/adminWarnings";
import { analyzeTransaction } from "../../src/lib/fraudEngine";
import { deriveRiskLevel } from "../../src/lib/aiGuard";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

// ── Severity classification (mirrors page logic) ──

type Severity = "HIGH" | "MEDIUM" | "LOW";
function getSeverity(count: number): Severity {
  if (count >= 3) return "HIGH";
  if (count >= 1) return "MEDIUM";
  return "LOW";
}

console.log("── Disputes Tests ──\n");

// 1. Severity thresholds
console.log("▸ Severity classification");
{
  assert(getSeverity(0) === "LOW", "0 disputes = LOW");
  assert(getSeverity(1) === "MEDIUM", "1 dispute = MEDIUM");
  assert(getSeverity(2) === "MEDIUM", "2 disputes = MEDIUM");
  assert(getSeverity(3) === "HIGH", "3 disputes = HIGH");
  assert(getSeverity(10) === "HIGH", "10 disputes = HIGH");
}

// 2. Admin warnings for dispute counts
console.log("\n▸ Admin warnings for disputes");
{
  const w0 = getAdminWarnings({ dispute_count: 0 });
  assert(
    !w0.some((w) => w.message.includes("dispute")),
    "0 disputes: no dispute warning"
  );

  const w1 = getAdminWarnings({ dispute_count: 1 });
  assert(w1.length === 0, "1 dispute: no warning (threshold is >1)");

  const w2 = getAdminWarnings({ dispute_count: 2 });
  assert(
    w2.some((w) => w.level === "medium" && w.message.includes("dispute")),
    "2 disputes: medium warning"
  );

  const w4 = getAdminWarnings({ dispute_count: 4 });
  assert(
    w4.some((w) => w.level === "high" && w.message.includes("dispute")),
    "4 disputes: high warning"
  );

  const w4msg = w4.find((w) => w.level === "high");
  assert(
    w4msg?.message.includes("4") ?? false,
    "4 disputes: warning message includes count"
  );
}

// 3. Admin warnings for restricted/suspended accounts (post-dispute state)
console.log("\n▸ Post-dispute account status warnings");
{
  const restricted = getAdminWarnings({ account_status: "restricted" });
  assert(
    restricted.some((w) => w.message.includes("restricted")),
    "Restricted account triggers warning"
  );

  const suspended = getAdminWarnings({ account_status: "suspended" });
  assert(
    suspended.some((w) => w.level === "high" && w.message.includes("suspended")),
    "Suspended account triggers high warning"
  );
}

// 4. Admin warnings for owed balance (negative wallet from dispute)
console.log("\n▸ Owed balance warnings");
{
  const owed = getAdminWarnings({ owed_balance: 25.5 });
  assert(
    owed.some((w) => w.message.includes("$25.50")),
    "Owed balance of $25.50 triggers warning with correct amount"
  );

  const noOwed = getAdminWarnings({ owed_balance: 0 });
  assert(
    !noOwed.some((w) => w.message.includes("outstanding")),
    "Zero owed balance: no warning"
  );
}

// 5. Combined dispute + restricted + flagged (real-world scenario)
console.log("\n▸ Combined chargeback scenario");
{
  const combo = getAdminWarnings({
    dispute_count: 5,
    account_status: "restricted",
    is_flagged: true,
    owed_balance: 100,
  });
  assert(combo.length >= 4, `Combined scenario: ≥4 warnings (got ${combo.length})`);
  assert(
    combo.some((w) => w.level === "high"),
    "Combined scenario includes high-level warning"
  );
}

// 6. Fraud engine: refund flag (disputes lead to refund transactions)
console.log("\n▸ Fraud engine: dispute-related scoring");
{
  const refund = analyzeTransaction({ amount: 50, isRefund: true });
  assert(
    refund.flags.includes("refund_activity"),
    "Refund transaction flagged"
  );

  const large = analyzeTransaction({ amount: 600 });
  assert(
    large.flags.includes("large_amount") && large.score >= 30,
    "Large disputed amount scores ≥30"
  );
}

// 7. AI guard risk derivation with dispute counts
console.log("\n▸ AI guard risk level with disputes");
{
  const low = deriveRiskLevel({ dispute_count: 0, refund_count: 0, tip_count: 10 });
  assert(low === "low", `0 disputes → low (got ${low})`);

  const med = deriveRiskLevel({ dispute_count: 2, refund_count: 1, tip_count: 10 });
  assert(med === "medium" || med === "high", `2 disputes → medium or high (got ${med})`);

  const high = deriveRiskLevel({ dispute_count: 4, refund_count: 3, tip_count: 10 });
  assert(high === "high" || high === "critical", `4 disputes → high or critical (got ${high})`);

  const crit = deriveRiskLevel({ dispute_count: 6, refund_count: 5, tip_count: 5 });
  assert(crit === "critical", `6 disputes → critical (got ${crit})`);
}

// 8. Severity styling mapping (ensures all branches return valid classes)
console.log("\n▸ Severity styling completeness");
{
  function severityStyle(s: Severity): string {
    switch (s) {
      case "HIGH": return "text-red-400 bg-red-500/10 border-red-400/20";
      case "MEDIUM": return "text-yellow-400 bg-yellow-500/10 border-yellow-400/20";
      case "LOW": return "text-green-400 bg-green-500/10 border-green-400/20";
    }
  }
  assert(severityStyle("HIGH").includes("red"), "HIGH = red styling");
  assert(severityStyle("MEDIUM").includes("yellow"), "MEDIUM = yellow styling");
  assert(severityStyle("LOW").includes("green"), "LOW = green styling");
}

// 9. Edge cases
console.log("\n▸ Edge cases");
{
  // Negative dispute count (shouldn't happen but shouldn't crash)
  assert(getSeverity(-1) === "LOW", "Negative count = LOW");

  // Very large dispute count
  assert(getSeverity(9999) === "HIGH", "Extremely high count = HIGH");

  // Admin warnings with empty context
  const empty = getAdminWarnings({});
  assert(Array.isArray(empty), "Empty context returns array");
  assert(empty.length === 0, "Empty context: no warnings");
}

// ── Summary ──
console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
