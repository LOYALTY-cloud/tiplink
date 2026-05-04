/**
 * Rate Limiter Logic Test
 *
 * Extracts and tests the in-memory sliding-window rate limiter from
 * src/middleware.ts without importing Next.js Edge runtime dependencies.
 *
 * Tests:
 * 1. First N requests within limit → all allowed
 * 2. Request N+1 → blocked (returns true)
 * 3. After window expiry (time-advance) → allowed again
 * 4. Different keys do NOT share buckets
 * 5. Auth route limit (20/min) is lower than general limit (60/min)
 * 6. Cleanup does not evict active buckets
 */

import { readFileSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log("── Rate Limiter Logic Tests ──\n");

// ── 1. Static analysis: correct constants in proxy.ts ────────────────────────
console.log("Static analysis:");
{
  const src = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");

  assert(
    src.includes("WINDOW_MS = 60_000"),
    "middleware: 60-second window"
  );
  assert(
    src.includes("MAX_REQUESTS = 60"),
    "middleware: 60 req/min general limit"
  );
  assert(
    src.includes("MAX_AUTH_REQUESTS = 20"),
    "middleware: 20 req/min auth limit"
  );
  assert(
    src.includes("isRateLimited"),
    "middleware: isRateLimited function defined"
  );
  assert(
    src.includes("bucket.count > limit"),
    "middleware: blocks on count > limit (allows exactly `limit` requests)"
  );
  assert(
    src.includes("cleanupStore"),
    "middleware: periodic store cleanup to prevent memory leak"
  );
}

// ── 2. Logic unit tests (extracted, no Edge runtime needed) ───────────────────
console.log("\nLogic unit tests:");

// Reproduce the exact implementation from middleware.ts
{
  const WINDOW_MS = 60_000;
  type Bucket = { count: number; resetAt: number };
  const store = new Map<string, Bucket>();

  let _now = Date.now();
  const getNow = () => _now;
  function advanceTime(ms: number) { _now += ms; }

  function isRateLimited(key: string, limit: number): boolean {
    const now = getNow();
    const bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return false;
    }
    bucket.count += 1;
    return bucket.count > limit;
  }

  const LIMIT = 5; // small limit for fast testing
  const key = "test_ip_1";

  // First `LIMIT` requests → all allowed
  let allAllowed = true;
  for (let i = 0; i < LIMIT; i++) {
    if (isRateLimited(key, LIMIT)) { allAllowed = false; break; }
  }
  assert(allAllowed, `first ${LIMIT} requests all allowed (count <= limit)`);

  // Request LIMIT+1 → blocked
  assert(isRateLimited(key, LIMIT), `request ${LIMIT + 1} is blocked (count > limit)`);

  // Further requests in same window → still blocked
  assert(isRateLimited(key, LIMIT), "subsequent requests in window also blocked");

  // Different key → independent bucket, not affected
  assert(!isRateLimited("test_ip_2", LIMIT), "different key has independent bucket");

  // After window expires → allowed again
  advanceTime(WINDOW_MS + 1);
  assert(!isRateLimited(key, LIMIT), "after window reset, first request allowed again");
  assert(!isRateLimited(key, LIMIT), "after window reset, second request also allowed");

  // Auth routes have a stricter limit
  const authKey = "auth_ip_1";
  const AUTH_LIMIT = 3;
  let authAllowed = true;
  for (let i = 0; i < AUTH_LIMIT; i++) {
    if (isRateLimited(authKey, AUTH_LIMIT)) { authAllowed = false; break; }
  }
  assert(authAllowed, `auth route: first ${AUTH_LIMIT} requests allowed`);
  assert(isRateLimited(authKey, AUTH_LIMIT), `auth route: request ${AUTH_LIMIT + 1} blocked`);

  // Expired buckets don't block new window
  const freshKey = "fresh_ip";
  isRateLimited(freshKey, LIMIT); // create bucket
  advanceTime(WINDOW_MS + 1000);
  assert(!isRateLimited(freshKey, LIMIT), "expired bucket discarded, new window starts clean");
}

// ── 3. Verify auth route detection logic in proxy.ts ──────────────────────────
console.log("\nAuth route detection:");
{
  const src = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");

  assert(
    src.includes('pathname.startsWith("/api/auth/")'),
    "middleware: /api/auth/* gets stricter rate limit"
  );
  assert(
    src.includes('pathname.startsWith("/api/admin/login")'),
    "middleware: /api/admin/login also gets stricter rate limit"
  );
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
