/**
 * Behavior tracker tests — velocity, card reuse, IP switching, volume spikes.
 */
import { analyzeBehavior, type BehaviorEvent } from "../../src/lib/behaviorTracker";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

function makeEvents(n: number, overrides?: Partial<BehaviorEvent>): BehaviorEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    amount: 5,
    card_last4: "1234",
    ip: "1.2.3.4",
    created_at: new Date(Date.now() - i * 1000).toISOString(),
    ...overrides,
  }));
}

console.log("── Behavior Tracker Tests ──\n");

// 1. Empty events — no risk
{
  const r = analyzeBehavior([]);
  assert(r.score === 0, `Empty: score = 0 (got ${r.score})`);
  assert(r.flags.length === 0, `Empty: no flags`);
}

// 2. Normal activity — 3 events
{
  const r = analyzeBehavior(makeEvents(3));
  assert(r.score < 40, `3 events: score < 40 (got ${r.score})`);
}

// 3. Burst activity — 12 events
{
  const r = analyzeBehavior(makeEvents(12));
  assert(r.flags.includes("burst_activity"), `12 events: has burst_activity flag`);
}

// 4. Rapid actions — 6-10 events
{
  const r = analyzeBehavior(makeEvents(7));
  assert(r.flags.includes("rapid_actions"), `7 events: has rapid_actions flag`);
}

// 5. Single card hammered — 4 events same card
{
  const events = makeEvents(4, { card_last4: "5678" });
  const r = analyzeBehavior(events);
  assert(r.flags.includes("single_card_hammered"), `4 same card: has single_card_hammered flag`);
}

// 6. Card fan-out — 5+ distinct cards
{
  const events: BehaviorEvent[] = [
    { amount: 5, card_last4: "1111", ip: "1.2.3.4", created_at: new Date().toISOString() },
    { amount: 5, card_last4: "2222", ip: "1.2.3.4", created_at: new Date().toISOString() },
    { amount: 5, card_last4: "3333", ip: "1.2.3.4", created_at: new Date().toISOString() },
    { amount: 5, card_last4: "4444", ip: "1.2.3.4", created_at: new Date().toISOString() },
    { amount: 5, card_last4: "5555", ip: "1.2.3.4", created_at: new Date().toISOString() },
  ];
  const r = analyzeBehavior(events);
  assert(r.flags.includes("card_fan_out"), `5 distinct cards: has card_fan_out flag`);
}

// 7. Volume spike — $1000+ total
{
  const events = makeEvents(3, { amount: 400 });
  const r = analyzeBehavior(events);
  assert(r.flags.includes("volume_spike"), `$1200 total: has volume_spike flag`);
}

// 8. Extreme volume spike — $2000+ total
{
  const events = makeEvents(5, { amount: 500 });
  const r = analyzeBehavior(events);
  assert(r.flags.includes("extreme_volume_spike"), `$2500 total: has extreme_volume_spike flag`);
}

// 9. IP switching — 4+ distinct IPs
{
  const events: BehaviorEvent[] = [
    { amount: 5, ip: "1.1.1.1", created_at: new Date().toISOString() },
    { amount: 5, ip: "2.2.2.2", created_at: new Date().toISOString() },
    { amount: 5, ip: "3.3.3.3", created_at: new Date().toISOString() },
    { amount: 5, ip: "4.4.4.4", created_at: new Date().toISOString() },
  ];
  const r = analyzeBehavior(events);
  assert(r.flags.includes("ip_switching"), `4 distinct IPs: has ip_switching flag`);
}

// 10. New account + high activity
{
  const events = makeEvents(5);
  const r = analyzeBehavior(events, { accountAgeHours: 0.5 });
  assert(r.flags.includes("new_account_surge") || r.score >= 20,
    `New account surge: flagged or high score (got ${r.score}, flags: ${r.flags.join(",")})`);
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
