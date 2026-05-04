/**
 * AI Request Rate Limiter
 * Prevents abuse and excessive AI consumption
 *
 * Limits:
 * - 10 requests per minute per admin
 * - 100 requests per minute globally
 */

type RateLimitKey = string;
type RequestTimestamps = number[];

const requestBuckets = new Map<RateLimitKey, RequestTimestamps>();

const REQUESTS_PER_MINUTE_PER_ADMIN = 10;
const REQUESTS_PER_MINUTE_GLOBAL = 100;
const WINDOW_MS = 60 * 1000; // 1 minute

function getCurrentWindow(): number {
  return Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
}

/**
 * Check if admin has exceeded rate limit
 */
export function isRateLimited(adminId: string): {
  limited: boolean;
  remainingRequests: number;
  resetAt: Date;
} {
  const adminKey = `admin:${adminId}`;
  const now = Date.now();
  const currentWindow = getCurrentWindow();

  // Get or initialize bucket
  let timestamps = requestBuckets.get(adminKey) ?? [];

  // Remove timestamps outside the current window
  timestamps = timestamps.filter((ts) => now - ts < WINDOW_MS);

  // Check limit
  if (timestamps.length >= REQUESTS_PER_MINUTE_PER_ADMIN) {
    const resetAt = new Date(currentWindow + WINDOW_MS);
    return {
      limited: true,
      remainingRequests: 0,
      resetAt,
    };
  }

  // Update bucket
  timestamps.push(now);
  requestBuckets.set(adminKey, timestamps);

  const resetAt = new Date(currentWindow + WINDOW_MS);
  const remaining = REQUESTS_PER_MINUTE_PER_ADMIN - timestamps.length;

  return {
    limited: false,
    remainingRequests: remaining,
    resetAt,
  };
}

/**
 * Check global rate limit
 */
export function isGloballyRateLimited(): {
  limited: boolean;
  requestsUsed: number;
} {
  const globalKey = "global";
  const now = Date.now();

  let timestamps = requestBuckets.get(globalKey) ?? [];
  timestamps = timestamps.filter((ts) => now - ts < WINDOW_MS);

  const limited = timestamps.length >= REQUESTS_PER_MINUTE_GLOBAL;

  // Update bucket
  timestamps.push(now);
  requestBuckets.set(globalKey, timestamps);

  return {
    limited,
    requestsUsed: timestamps.length,
  };
}

/**
 * Get rate limit stats for monitoring
 */
export function getRateLimitStats(adminId: string): {
  adminUsed: number;
  adminLimit: number;
  globalUsed: number;
  globalLimit: number;
  adminResetAt: Date;
} {
  const adminKey = `admin:${adminId}`;
  const now = Date.now();
  const currentWindow = getCurrentWindow();

  const adminTimestamps = (requestBuckets.get(adminKey) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );

  const globalTimestamps = (requestBuckets.get("global") ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );

  const adminResetAt = new Date(currentWindow + WINDOW_MS);

  return {
    adminUsed: adminTimestamps.length,
    adminLimit: REQUESTS_PER_MINUTE_PER_ADMIN,
    globalUsed: globalTimestamps.length,
    globalLimit: REQUESTS_PER_MINUTE_GLOBAL,
    adminResetAt,
  };
}
