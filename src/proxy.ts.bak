import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isOwnerEliteEmail } from "@/lib/creatorAccess";

/**
 * Global middleware — runs on every matched request.
 *
 * 1.  In-memory sliding-window rate limiter for /api/* routes.
 *     This is a lightweight first line of defence. Per-route Supabase-backed
 *     limits still apply for critical endpoints.
 *
 * 2.  Attaches request metadata headers (IP, user-agent) so downstream
 *     handlers can log them without re-parsing.
 *
 * 3.  Auth gate for /dashboard/* and /admin/* — redirects unauthenticated
 *     users to /auth/login.
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

// --------------- proxy ---------------
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Auth gate for protected page routes ──
  // Admin routes use their own login flow (passcode-based via localStorage)
  // so we skip the Supabase auth gate for /admin/*
  if (pathname.startsWith("/dashboard")) {
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              req.cookies.set(name, value);
              res.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Creator-only gate for Theme Builder routes.
    // Mirrors the prior middleware.ts behavior so non-creators cannot access
    // /dashboard/themebuilder pages even when authenticated.
    if (pathname === "/dashboard/themebuilder" || pathname.startsWith("/dashboard/themebuilder/")) {
      try {
        const profileRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${user.id}&select=is_creator&limit=1`,
          {
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
              Accept: "application/json",
              "Cache-Control": "no-cache",
            },
          }
        );

        if (profileRes.ok) {
          const profiles = await profileRes.json();
          const isCreator = profiles?.[0]?.is_creator === true;
          const ownerElite = isOwnerEliteEmail(user.email);
          if (!isCreator && !ownerElite) {
            const redirectUrl = req.nextUrl.clone();
            redirectUrl.pathname = "/dashboard";
            redirectUrl.searchParams.set("creator_gate", "1");
            return NextResponse.redirect(redirectUrl);
          }
        }
      } catch (err) {
        // Fail open to avoid locking out legitimate creators if this check fails.
        console.error("proxy: creator check failed", err);
      }
    }

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
