/**
 * Fee calculation tests — verifies correct rounding and fee structure.
 */
import { calculateTipFees, STRIPE_PERCENT, STRIPE_FLAT, PLATFORM_PERCENT } from "../../src/lib/fees";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log("── Fee Calculation Tests ──\n");

// 1. Constants
assert(STRIPE_PERCENT === 0.029, "Stripe percent is 2.9%");
assert(STRIPE_FLAT === 0.30, "Stripe flat fee is $0.30");
assert(PLATFORM_PERCENT === 0.011, "Platform percent is 1.1%");

// 2. $1 minimum tip
{
  const r = calculateTipFees(1);
  assert(r.stripeFee === 0.33, `$1 tip: stripe fee = $0.33 (got ${r.stripeFee})`);
  assert(r.platformFee === 0.01, `$1 tip: platform fee = $0.01 (got ${r.platformFee})`);
  assert(r.total === 1.34, `$1 tip: total = $1.34 (got ${r.total})`);
}

// 3. $10 tip
{
  const r = calculateTipFees(10);
  assert(r.stripeFee === 0.59, `$10 tip: stripe fee = $0.59 (got ${r.stripeFee})`);
  assert(r.platformFee === 0.11, `$10 tip: platform fee = $0.11 (got ${r.platformFee})`);
  assert(r.total === 10.70, `$10 tip: total = $10.70 (got ${r.total})`);
}

// 4. $100 tip
{
  const r = calculateTipFees(100);
  assert(r.stripeFee === 3.20, `$100 tip: stripe fee = $3.20 (got ${r.stripeFee})`);
  assert(r.platformFee === 1.10, `$100 tip: platform fee = $1.10 (got ${r.platformFee})`);
  assert(r.total === 104.30, `$100 tip: total = $104.30 (got ${r.total})`);
}

// 5. $500 max tip
{
  const r = calculateTipFees(500);
  assert(r.stripeFee === 14.80, `$500 tip: stripe fee = $14.80 (got ${r.stripeFee})`);
  assert(r.platformFee === 5.50, `$500 tip: platform fee = $5.50 (got ${r.platformFee})`);
  assert(r.total === 520.30, `$500 tip: total = $520.30 (got ${r.total})`);
}

// 6. No floating point dust — all results should be clean 2-decimal values
for (const amount of [1.50, 3.33, 7.77, 19.99, 49.95, 99.99, 250.00]) {
  const r = calculateTipFees(amount);
  const check = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 0.001;
  assert(check(r.stripeFee) && check(r.platformFee) && check(r.totalFees) && check(r.total),
    `$${amount} tip: all values are clean 2-decimal numbers`);
}

// 7. total = amount + totalFees
for (const amount of [1, 5, 25, 100, 499]) {
  const r = calculateTipFees(amount);
  assert(r.total === Math.round((amount + r.totalFees) * 100) / 100,
    `$${amount} tip: total = amount + totalFees`);
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
