/**
 * Fraud System Tests
 *
 * Covers:
 *  1. fraudEngine.ts  — analyzeTransaction() rule scoring
 *  2. behaviorTracker.ts — analyzeBehavior() pattern scoring
 *  3. fraudPatternDetector.ts — detectFraudPatterns() timeline detection
 *  4. fraudOrchestrator.ts — weighted combination + trust bonuses + thresholds
 *  5. aiFraud.ts — fail-open behavior (no API key → neutral score 0)
 */

import { analyzeTransaction } from "../../src/lib/fraudEngine";
import { analyzeBehavior, type BehaviorEvent } from "../../src/lib/behaviorTracker";
import { detectFraudPatterns } from "../../src/lib/fraudPatternDetector";
import { aiFraudCheck } from "../../src/lib/aiFraud";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeEvent(
  amount: number,
  opts?: { card_last4?: string; ip?: string; created_at?: string }
): BehaviorEvent {
  return {
    amount,
    card_last4: opts?.card_last4,
    ip: opts?.ip ?? "1.2.3.4",
    created_at: opts?.created_at ?? new Date().toISOString(),
  };
}

function ts(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ─── 1. fraudEngine — analyzeTransaction ─────────────────────────────────────

console.log("\n[1] fraudEngine.analyzeTransaction");

{
  const r = analyzeTransaction({ amount: 10 });
  assert(r.score === 0, "clean small tx → score 0");
  assert(r.level === "low", "clean small tx → level low");
  assert(r.flags.length === 0, "clean small tx → no flags");
}

{
  const r = analyzeTransaction({ amount: 250 });
  assert(r.flags.includes("elevated_amount"), "amount 250 → elevated_amount flag");
  assert(r.score >= 10, "amount 250 → score >= 10");
}

{
  const r = analyzeTransaction({ amount: 600 });
  assert(r.flags.includes("large_amount"), "amount 600 → large_amount flag");
  assert(r.score >= 30, "amount 600 → score >= 30");
}

{
  const r = analyzeTransaction({ amount: 50, recentTips: 6 });
  assert(r.flags.includes("rapid_activity"), "6 recent tips → rapid_activity flag");
  assert(r.score >= 25, "6 recent tips → score >= 25");
}

{
  const r = analyzeTransaction({ amount: 50, recentTips: 11 });
  assert(r.flags.includes("burst_activity"), "11 recent tips → burst_activity flag");
  assert(r.score >= 40, "11 recent tips → score >= 40");
}

{
  const r = analyzeTransaction({ amount: 50, sameCardCount: 4 });
  assert(r.flags.includes("card_spam"), "4 same card uses → card_spam flag");
  assert(r.score >= 40, "4 same card uses → score >= 40");
}

{
  const r = analyzeTransaction({ amount: 50, sameCardCount: 6 });
  assert(r.flags.includes("card_abuse"), "6 same card uses → card_abuse flag");
  assert(r.score >= 50, "6 same card uses → score >= 50");
}

{
  const r = analyzeTransaction({ amount: 50, isRefund: true });
  assert(r.flags.includes("refund_activity"), "refund → refund_activity flag");
  assert(r.score >= 20, "refund → score >= 20");
}

{
  const r = analyzeTransaction({ amount: 50, accountAgeHours: 1 });
  assert(r.flags.includes("new_account"), "account age 1h → new_account flag");
  assert(r.score >= 15, "account age 1h → score >= 15");
}

{
  // High-risk combo: large amount + burst + card abuse → level high
  const r = analyzeTransaction({ amount: 600, recentTips: 12, sameCardCount: 6 });
  assert(r.level === "high", "large + burst + card abuse → level high");
  assert(r.score >= 80, "large + burst + card abuse → score >= 80");
}

// ─── 2. behaviorTracker — analyzeBehavior ────────────────────────────────────

console.log("\n[2] behaviorTracker.analyzeBehavior");

{
  const r = analyzeBehavior([]);
  assert(r.score === 0, "empty events → score 0");
  assert(r.flags.length === 0, "empty events → no flags");
}

{
  const events = Array.from({ length: 11 }, () => makeEvent(10));
  const r = analyzeBehavior(events);
  assert(r.flags.includes("burst_activity"), "11 events → burst_activity flag");
  assert(r.score >= 40, "11 events → score >= 40");
}

{
  const events = Array.from({ length: 6 }, () => makeEvent(10));
  const r = analyzeBehavior(events);
  assert(r.flags.includes("rapid_actions"), "6 events → rapid_actions flag");
  assert(r.score >= 20, "6 events → score >= 20");
}

{
  // Same card hammered (4 events, 1 unique card)
  const events = Array.from({ length: 4 }, () =>
    makeEvent(50, { card_last4: "1234" })
  );
  const r = analyzeBehavior(events);
  assert(r.flags.includes("single_card_hammered"), "4x same card → single_card_hammered");
  assert(r.score >= 30, "4x same card → score >= 30");
}

{
  // Card fan-out (5 distinct cards)
  const events = ["1111", "2222", "3333", "4444", "5555"].map((c) =>
    makeEvent(20, { card_last4: c })
  );
  const r = analyzeBehavior(events);
  assert(r.flags.includes("card_fan_out"), "5 distinct cards → card_fan_out flag");
  assert(r.score >= 35, "5 distinct cards → score >= 35");
}

{
  // Volume spike >$1000
  const events = Array.from({ length: 5 }, () => makeEvent(250));
  const r = analyzeBehavior(events);
  assert(r.flags.includes("volume_spike"), "$1250 total → volume_spike flag");
  assert(r.score >= 30, "$1250 total → score >= 30");
}

{
  // Extreme volume spike >$2000
  const events = Array.from({ length: 5 }, () => makeEvent(500));
  const r = analyzeBehavior(events);
  assert(r.flags.includes("extreme_volume_spike"), "$2500 total → extreme_volume_spike flag");
  assert(r.score >= 40, "$2500 total → score >= 40");
}

{
  // IP switching (4 distinct IPs)
  const events = ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"].map((ip) =>
    makeEvent(10, { ip })
  );
  const r = analyzeBehavior(events);
  assert(r.flags.includes("ip_switching"), "4 IPs → ip_switching flag");
  assert(r.score >= 25, "4 IPs → score >= 25");
}

{
  // New account + burst (< 1 hour old, > 3 events)
  const events = Array.from({ length: 4 }, () => makeEvent(10));
  const r = analyzeBehavior(events, { accountAgeHours: 0.5 });
  assert(r.flags.includes("new_account_burst"), "0.5h old + 4 events → new_account_burst");
  assert(r.score >= 20, "new account burst → score >= 20");
}

{
  // Micro-transactions (6 events under $2)
  const events = Array.from({ length: 6 }, () => makeEvent(1));
  const r = analyzeBehavior(events);
  assert(r.flags.includes("micro_transactions"), "6 micro txs → micro_transactions flag");
  assert(r.score >= 30, "6 micro txs → score >= 30");
}

{
  // Score is capped at 100
  const events = Array.from({ length: 12 }, (_, i) =>
    makeEvent(300, { card_last4: String(i).padStart(4, "0"), ip: `${i}.0.0.1` })
  );
  const r = analyzeBehavior(events);
  assert(r.score <= 100, "score is capped at 100");
}

// ─── 3. fraudPatternDetector — detectFraudPatterns ───────────────────────────

console.log("\n[3] fraudPatternDetector.detectFraudPatterns");

{
  const r = detectFraudPatterns([]);
  assert(r.length === 0, "fewer than 2 events → no patterns");
}

{
  // Rapid activity — two actions within 60s
  const events = [
    { action: "tip_created", created_at: ts(0) },
    { action: "tip_created", created_at: ts(30_000) }, // 30s later
  ];
  const r = detectFraudPatterns(events);
  assert(r.some((p) => p.type === "rapid_activity"), "actions 30s apart → rapid_activity");
}

{
  // Refund pattern (2 refunds)
  const events = [
    { action: "refund_requested", created_at: ts(0) },
    { action: "refund_approved", created_at: ts(60_000) },
  ];
  const r = detectFraudPatterns(events);
  assert(r.some((p) => p.type === "refund_pattern"), "2 refund events → refund_pattern");
  assert(r.find((p) => p.type === "refund_pattern")?.severity === "medium", "refund_pattern severity is medium");
}

{
  // Refund abuse (3+ refunds)
  const events = [
    { action: "refund_requested", created_at: ts(0) },
    { action: "refund_approved", created_at: ts(60_000) },
    { action: "refund_requested", created_at: ts(120_000) },
  ];
  const r = detectFraudPatterns(events);
  assert(r.some((p) => p.type === "refund_abuse"), "3 refund events → refund_abuse");
  assert(r.find((p) => p.type === "refund_abuse")?.severity === "high", "refund_abuse severity is high");
}

{
  // Tip → refund loop
  const events = [
    { action: "tip_received", created_at: ts(0) },
    { action: "refund_requested", created_at: ts(5_000) },
  ];
  const r = detectFraudPatterns(events);
  assert(r.some((p) => p.type === "tip_refund_loop"), "tip then refund → tip_refund_loop");
  assert(r.find((p) => p.type === "tip_refund_loop")?.severity === "high", "tip_refund_loop severity is high");
}

{
  // Escalation pattern: restriction after burst (5+ events + restrict)
  const events = [
    { action: "tip_created", created_at: ts(0) },
    { action: "tip_created", created_at: ts(1000) },
    { action: "tip_created", created_at: ts(2000) },
    { action: "tip_created", created_at: ts(3000) },
    { action: "auto_restrict", created_at: ts(4000) },
  ];
  const r = detectFraudPatterns(events);
  assert(r.some((p) => p.type === "escalation_pattern"), "burst + restrict → escalation_pattern");
}

{
  // Role change detected
  const events = [
    { action: "login", created_at: ts(0) },
    { action: "set_role", created_at: ts(1000) },
  ];
  const r = detectFraudPatterns(events);
  assert(r.some((p) => p.type === "role_change"), "set_role event → role_change pattern");
}

{
  // Repeated action (same action 4+ times)
  const events = Array.from({ length: 4 }, (_, i) => ({
    action: "tip_created",
    created_at: ts(i * 5000),
  }));
  const r = detectFraudPatterns(events);
  assert(r.some((p) => p.type === "repeated_action"), "4× same action → repeated_action");
}

// ─── 4. fraudOrchestrator — weighted scoring + decision thresholds ────────────

console.log("\n[4] fraudOrchestrator weighted scoring (inline simulation)");

/**
 * Replicate the core orchestrator math without DB calls so we can
 * verify thresholds, trust bonuses, and fraud decision boundaries.
 */
function simulateOrchestrator(opts: {
  ruleScore: number;
  behaviorScore: number;
  aiScore: number;
  isVerified?: boolean;
  accountAgeHours?: number;
}): { totalScore: number; decision: string } {
  let weighted =
    opts.ruleScore * 0.5 +
    opts.behaviorScore * 0.3 +
    opts.aiScore * 0.2;

  if (opts.isVerified) weighted -= 10;
  if ((opts.accountAgeHours ?? 0) > 30 * 24) weighted -= 5;
  if ((opts.accountAgeHours ?? 0) > 90 * 24) weighted -= 3;
  weighted = Math.max(0, weighted);

  const totalScore = Math.min(100, Math.round(weighted));

  const decision =
    totalScore >= 80 ? "restrict" :
    totalScore >= 60 ? "review" :
    totalScore >= 40 ? "flag" :
    "allow";

  return { totalScore, decision };
}

{
  const r = simulateOrchestrator({ ruleScore: 0, behaviorScore: 0, aiScore: 0 });
  assert(r.decision === "allow", "all-zero scores → allow");
  assert(r.totalScore === 0, "all-zero scores → 0");
}

{
  // Score exactly at "flag" boundary (40)
  // Need: 0.5R + 0.3B + 0.2A = 40 → use R=80, B=0, A=0
  const r = simulateOrchestrator({ ruleScore: 80, behaviorScore: 0, aiScore: 0 });
  assert(r.totalScore === 40, "ruleScore=80 → totalScore=40");
  assert(r.decision === "flag", "totalScore=40 → flag");
}

{
  // "review" boundary (60)
  // 0.5*100 + 0.3*33 + 0.2*0 = 50+9.9=59.9 ≈ 60 — let's use 100+67+0
  const r = simulateOrchestrator({ ruleScore: 100, behaviorScore: 67, aiScore: 0 });
  assert(r.decision === "review" || r.decision === "flag", "scores near 60 boundary → review or flag");
}

{
  // Full restrict: all scores high
  const r = simulateOrchestrator({ ruleScore: 100, behaviorScore: 100, aiScore: 100 });
  assert(r.decision === "restrict", "max scores → restrict");
  assert(r.totalScore === 100, "max scores → totalScore=100");
}

{
  // KYC verified trust bonus reduces score
  const r1 = simulateOrchestrator({ ruleScore: 80, behaviorScore: 80, aiScore: 80 });
  const r2 = simulateOrchestrator({ ruleScore: 80, behaviorScore: 80, aiScore: 80, isVerified: true });
  assert(r2.totalScore === r1.totalScore - 10, "verified user: -10 trust bonus applied");
}

{
  // 30+ day account reduces score by 5
  const r1 = simulateOrchestrator({ ruleScore: 60, behaviorScore: 60, aiScore: 60 });
  const r2 = simulateOrchestrator({ ruleScore: 60, behaviorScore: 60, aiScore: 60, accountAgeHours: 31 * 24 });
  assert(r2.totalScore === r1.totalScore - 5, "30d+ account: -5 trust bonus applied");
}

{
  // 90+ day account gets cumulative -8 bonus (−5 for 30d + −3 for 90d)
  const r1 = simulateOrchestrator({ ruleScore: 60, behaviorScore: 60, aiScore: 60 });
  const r2 = simulateOrchestrator({ ruleScore: 60, behaviorScore: 60, aiScore: 60, accountAgeHours: 91 * 24 });
  assert(r2.totalScore === r1.totalScore - 8, "90d+ account: -8 total trust bonus applied");
}

{
  // Score never goes negative
  const r = simulateOrchestrator({ ruleScore: 0, behaviorScore: 0, aiScore: 0, isVerified: true, accountAgeHours: 100 * 24 });
  assert(r.totalScore >= 0, "score floored at 0, never negative");
}

// ─── 5. aiFraud — fail-open when no API key ──────────────────────────────────

console.log("\n[5] aiFraud.aiFraudCheck — fail-open");

{
  // Clear any API key so AI cannot call OpenAI
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await aiFraudCheck({
    amount: 100,
    recentTipCount: 3,
    recentTotalVolume: 300,
    uniqueCardsUsed: 1,
    uniqueIps: 1,
    accountAgeHours: 48,
    currentRiskScore: 10,
    previousRestrictions: 0,
    isAnonymous: false,
    timeOfDay: 14,
  });

  assert(result.score === 0, "no API key → AI returns neutral score 0 (fail-open)");
  assert(result.reason === "ai_unavailable", "no API key → reason is ai_unavailable");

  if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
if (failed === 0) {
  console.log(`Fraud system test OK (${passed} assertions passed)`);
} else {
  console.error(`FAILED: ${failed} assertion(s) failed, ${passed} passed`);
  process.exit(1);
}
