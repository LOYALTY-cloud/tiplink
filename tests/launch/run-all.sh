#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  1NELINK LAUNCH READINESS TEST SUITE
#  Runs all offline unit tests that verify platform correctness.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

# Always run from project root
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

PASS=0
FAIL=0
RESULTS=()

run_test() {
  local name=$1
  local file=$2
  echo ""
  echo "━━━ $name ━━━"
  if npx tsx "$file"; then
    PASS=$((PASS + 1))
    RESULTS+=("  ✅ $name")
  else
    FAIL=$((FAIL + 1))
    RESULTS+=("  ❌ $name")
  fi
}

echo "╔══════════════════════════════════════════════╗"
echo "║   1NELINK LAUNCH READINESS TEST SUITE       ║"
echo "╚══════════════════════════════════════════════╝"

# Unit tests — no DB or network required
run_test "Fee Calculation"       "tests/launch/fees.test.ts"
run_test "Fraud Engine"          "tests/launch/fraud-engine.test.ts"
run_test "Behavior Tracker"      "tests/launch/behavior-tracker.test.ts"
run_test "AI Guard Security"     "tests/launch/ai-guard.test.ts"
run_test "AI Fallback"           "tests/launch/ai-fallback.test.ts"
run_test "Admin Permissions"     "tests/launch/admin-permissions.test.ts"

# Existing mocked integration tests
run_test "Webhook: Payment"      "tests/webhook/payment-intent.test.ts"
run_test "Webhook: Refund"       "tests/webhook/refund.test.ts"
run_test "Webhook: Refund FB"    "tests/webhook/refund_fallback.test.ts"
run_test "Concurrency: W+R"     "tests/concurrent/withdraw-refund.test.ts"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║              SUMMARY                         ║"
echo "╚══════════════════════════════════════════════╝"
for r in "${RESULTS[@]}"; do
  echo "$r"
done
echo ""
echo "  Total: $((PASS + FAIL)) | Passed: $PASS | Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  ⚠️  SOME TESTS FAILED — review before launch"
  exit 1
else
  echo "  🟢 ALL TESTS PASSED — launch readiness confirmed"
  exit 0
fi
