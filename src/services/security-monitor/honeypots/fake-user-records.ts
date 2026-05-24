/**
 * Honeypot: Fake user records — returns procedurally generated decoy data.
 * These are served by the honeypot endpoint to waste attacker time + trigger alerts.
 * NONE of this data is real. Do not store or use in any business logic.
 */

export interface FakeUser {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface FakeTransaction {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

const FAKE_NAMES = ["alex_j", "taylor_m", "sam_r", "jordan_k", "casey_l"];
const FAKE_DOMAINS = ["mail.test", "inbox.test", "webmail.test"];

function fakeId(seed: number): string {
  return `00000000-dead-beef-${String(seed).padStart(4, "0")}-000000000000`;
}

function fakeDateAgo(days: number): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

export function generateFakeUsers(count: number = 5): FakeUser[] {
  return Array.from({ length: count }, (_, i) => ({
    id:         fakeId(i + 1),
    username:   FAKE_NAMES[i % FAKE_NAMES.length],
    email:      `${FAKE_NAMES[i % FAKE_NAMES.length]}@${FAKE_DOMAINS[i % FAKE_DOMAINS.length]}`,
    created_at: fakeDateAgo(i * 3 + 1),
  }));
}

export function generateFakeTransactions(count: number = 5): FakeTransaction[] {
  return Array.from({ length: count }, (_, i) => ({
    id:         fakeId(i + 100),
    amount:     parseFloat((Math.random() * 200 + 10).toFixed(2)),
    status:     i % 3 === 0 ? "failed" : "completed",
    created_at: fakeDateAgo(i + 1),
  }));
}
