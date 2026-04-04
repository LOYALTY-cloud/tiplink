import { NextResponse, type NextRequest } from "next/server";

/**
 * Global middleware — runs on every matched request.
 *
 * 1.  In-memory sliding-window rate limiter for /api/* routes.
 *     This is a lightweight first line of defence. Per-route Supabase-backed
 *     limits still apply for critical endpoints.
 *
 * 2.  Attaches request metadata headers (IP, user-agent) so downstream
 *     handlers can log them without re-parsing.
 */

// --------------- in-memory rate limit store ---------------
const WINDOW_MS = 60_000;          // 1-minute window
const MAX_REQUESTS = 60;           // 60 req/min per IP (general API)
const MAX_AUTH_REQUESTS = 20;      // 20 req/min for auth routes

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

// Periodic cleanup to prevent memory leaks (every 2 min)
let lastCleanup = Date.now();
function cleanupStore() {
  const now = Date.now();
  if (now - lastCleanup < 120_000) return;
  lastCleanup = now;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

function isRateLimited(key: string, limit: number): boolean {
  cleanupStore();
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

// --------------- helpers ---------------
function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// --------------- middleware ---------------
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only rate-limit API routes
  if (pathname.startsWith("/api")) {
    const ip = getIp(req);

    // Tighter limit on auth-related endpoints
    const isAuth = pathname.startsWith("/api/auth") || pathname.startsWith("/api/admin/login");
    const limit = isAuth ? MAX_AUTH_REQUESTS : MAX_REQUESTS;
    const key = `${ip}:${isAuth ? "auth" : "api"}`;

    if (isRateLimited(key, limit)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // Attach metadata for downstream handlers
    const res = NextResponse.next();
    res.headers.set("x-client-ip", ip);
    res.headers.set("x-client-ua", req.headers.get("user-agent") || "");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
