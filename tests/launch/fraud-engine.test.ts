/**
 * Fraud engine tests — verifies scoring, flagging, and threshold behavior.
 */
import { analyzeTransaction } from "../../src/lib/fraudEngine";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log("── Fraud Engine Tests ──\n");

// 1. Clean transaction — low risk
{
  const r = analyzeTransaction({ amount: 5 });
  assert(r.score === 0, `Clean $5 tip: score = 0 (got ${r.score})`);
  assert(r.flags.length === 0, `Clean tip: no flags`);
  assert(r.level === "low", `Clean tip: level = low`);
}

// 2. Large amount >$500
{
  const r = analyzeTransaction({ amount: 600 });
  assert(r.score >= 30, `$600 tip: score >= 30 (got ${r.score})`);
  assert(r.flags.includes("large_amount"), `$600 tip: has large_amount flag`);
}

// 3. Elevated amount $200-$500
{
  const r = analyzeTransaction({ amount: 300 });
  assert(r.score >= 10, `$300 tip: score >= 10 (got ${r.score})`);
  assert(r.flags.includes("elevated_amount"), `$300 tip: has elevated_amount flag`);
}

// 4. Burst activity (>10 recent tips)
{
  const r = analyzeTransaction({ amount: 5, recentTips: 15 });
  assert(r.score >= 40, `Burst activity: score >= 40 (got ${r.score})`);
  assert(r.flags.includes("burst_activity"), `Burst: has burst_activity flag`);
}

// 5. Rapid activity (5-10 recent tips)
{
  const r = analyzeTransaction({ amount: 5, recentTips: 7 });
  assert(r.score >= 25, `Rapid activity: score >= 25 (got ${r.score})`);
  assert(r.flags.includes("rapid_activity"), `Rapid: has rapid_activity flag`);
}

// 6. Card abuse (>5 same card uses)
{
  const r = analyzeTransaction({ amount: 5, sameCardCount: 6 });
  assert(r.score >= 50, `Card abuse: score >= 50 (got ${r.score})`);
  assert(r.flags.includes("card_abuse"), `Card abuse: has card_abuse flag`);
}

// 7. Card spam (3-5 same card)
{
  const r = analyzeTransaction({ amount: 5, sameCardCount: 4 });
  assert(r.score >= 40, `Card spam: score >= 40 (got ${r.score})`);
  assert(r.flags.includes("card_spam"), `Card spam: has card_spam flag`);
}

// 8. Refund activity
{
  const r = analyzeTransaction({ amount: 10, isRefund: true });
  assert(r.score >= 20, `Refund: score >= 20 (got ${r.score})`);
  assert(r.flags.includes("refund_activity"), `Refund: has refund_activity flag`);
}

// 9. New account (<2 hours)
{
  const r = analyzeTransaction({ amount: 5, accountAgeHours: 0.5 });
  assert(r.score >= 15, `New account: score >= 15 (got ${r.score})`);
  assert(r.flags.includes("new_account"), `New account: has new_account flag`);
}

// 10. Combined high-risk: burst + card abuse + new account + large amount
{
  const r = analyzeTransaction({ amount: 600, recentTips: 15, sameCardCount: 6, accountAgeHours: 0.5, isRefund: true });
  assert(r.score >= 80, `Combined high-risk: score >= 80 (got ${r.score})`);
  assert(r.level === "high", `Combined high-risk: level = high`);
  assert(r.flags.length >= 4, `Combined: multiple flags (got ${r.flags.length})`);
}

// 11. Level thresholds
{
  const low = analyzeTransaction({ amount: 5 });
  assert(low.level === "low", `Score ${low.score}: level = low`);

  const medium = analyzeTransaction({ amount: 5, sameCardCount: 4 });
  assert(medium.level === "medium", `Score ${medium.score}: level = medium`);

  const high = analyzeTransaction({ amount: 600, recentTips: 15, sameCardCount: 6 });
  assert(high.level === "high", `Score ${high.score}: level = high`);
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
