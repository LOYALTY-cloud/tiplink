import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { jwtVerify } from "jose";
import { isOwnerEliteEmail } from "@/lib/creatorAccess";

/**
 * Global middleware — runs on every matched request.
 *
 * 1. Rate limiting (in-memory sliding window) for /api/* routes.
 * 2. Attaches request metadata headers (IP, user-agent).
 * 3. Auth gate: /dashboard/* → Supabase session required.
 * 4. Auth gate: /admin/*    → signed admin JWT cookie required.
 */

// --------------- in-memory rate limit store ---------------
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;          // 60 req/min per IP (general API)
const MAX_AUTH_REQUESTS = 20;     // 20 req/min for auth routes

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

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

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// --------------- admin JWT verification ---------------
const ADMIN_SKIP_PATHS = ["/admin/login", "/admin/blocked"];

async function verifyAdminCookie(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("admin_jwt")?.value;
  if (!token) return false;

  const raw = process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) return false;

  try {
    const secret = new TextEncoder().encode(raw);
    await jwtVerify(token, secret, { issuer: "1nelink-admin" });
    return true;
  } catch {
    return false;
  }
}

// --------------- proxy ---------------
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getIp(req);

  // API rate limiting
  if (pathname.startsWith("/api/")) {
    const isAuthRoute = pathname.startsWith("/api/auth/") || pathname.startsWith("/api/admin/login");
    const limit = isAuthRoute ? MAX_AUTH_REQUESTS : MAX_REQUESTS;
    if (isRateLimited(`${ip}:${pathname.split("/").slice(0, 3).join("/")}`, limit)) {
      return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "60" },
      });
    }
  }

  // Attach metadata headers for downstream handlers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-real-ip", ip);
  requestHeaders.set("x-user-agent", req.headers.get("user-agent") ?? "");

  // ── Admin route protection ──────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Allow login and blocked pages through
    if (ADMIN_SKIP_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    const valid = await verifyAdminCookie(req);
    if (!valid) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── Dashboard route protection ──────────────────────────────────────────
  if (pathname.startsWith("/dashboard")) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
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

    // Creator-only gate for Theme Builder
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
      } catch {
        // Fail open — don't lock out legitimate creators on fetch error
      }
    }

    return res;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/api/:path*",
  ],
};
