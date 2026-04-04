/**
 * Behavior pattern analysis engine.
 * Scores user activity patterns to detect anomalies:
 *   - Rapid-fire actions (velocity)
 *   - Card reuse / fan-out
 *   - Volume spikes
 *   - IP switching
 *   - Time-of-day anomalies
 */

export type BehaviorEvent = {
  amount: number;
  card_last4?: string;
  ip?: string;
  created_at: string;
};

export type BehaviorResult = {
  score: number;
  flags: string[];
};

export function analyzeBehavior(
  events: BehaviorEvent[],
  opts?: { currentIp?: string; accountAgeHours?: number }
): BehaviorResult {
  let score = 0;
  const flags: string[] = [];

  if (events.length === 0) return { score: 0, flags: [] };

  // 1) Rapid actions — many events in short window
  if (events.length > 10) {
    score += 40;
    flags.push("burst_activity");
  } else if (events.length > 5) {
    score += 20;
    flags.push("rapid_actions");
  }

  // 2) Card reuse / fan-out — same card used repeatedly or many distinct cards
  const cards = events.map((e) => e.card_last4).filter(Boolean);
  const uniqueCards = new Set(cards);
  if (cards.length > 0) {
    // Same card hammered
    if (cards.length > 3 && uniqueCards.size === 1) {
      score += 30;
      flags.push("single_card_hammered");
    }
    // Many distinct cards (card testing / stolen batch)
    if (uniqueCards.size > 4) {
      score += 35;
      flags.push("card_fan_out");
    }
  }

  // 3) Volume spike — unusually high total in window
  const total = events.reduce((s, e) => s + e.amount, 0);
  if (total > 2000) {
    score += 40;
    flags.push("extreme_volume_spike");
  } else if (total > 1000) {
    score += 30;
    flags.push("volume_spike");
  } else if (total > 500) {
    score += 15;
    flags.push("elevated_volume");
  }

  // 4) IP switching — many distinct IPs in recent events
  const ips = events.map((e) => e.ip).filter(Boolean);
  const uniqueIps = new Set(ips);
  if (uniqueIps.size > 3) {
    score += 25;
    flags.push("ip_switching");
  }

  // 5) New account + high activity
  if (opts?.accountAgeHours != null && opts.accountAgeHours < 1 && events.length > 3) {
    score += 20;
    flags.push("new_account_burst");
  }

  // 6) Micro-transaction pattern (card testing)
  const microTxCount = events.filter((e) => e.amount < 2).length;
  if (microTxCount > 5) {
    score += 30;
    flags.push("micro_transactions");
  }

  // Cap at 100
  return { score: Math.min(score, 100), flags };
}
