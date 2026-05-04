/**
 * Admin Auth Gate Test
 *
 * Verifies that:
 * 1. src/middleware.ts exists and is the real Next.js middleware (not proxy.ts)
 * 2. /admin/* routes are gated behind admin_jwt cookie verification
 * 3. /admin/login is exempt from the gate (allows login page through)
 * 4. The login API sets an HttpOnly cookie
 * 5. The logout API exists and clears the cookie
 * 6. clearAdminSession() calls the logout endpoint
 * 7. adminJwt uses HMAC-SHA256 (jose) with correct issuer
 *
 * Static analysis — no live server needed.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log("── Admin Auth Gate Tests ──\n");

const ROOT = resolve(process.cwd());

// ── 1. Real proxy file exists (Next.js 16 uses proxy.ts, not middleware.ts) ───
assert(
  existsSync(resolve(ROOT, "src/proxy.ts")),
  "src/proxy.ts exists (Next.js 16 convention)"
);

assert(
  !existsSync(resolve(ROOT, "src/middleware.ts")),
  "src/middleware.ts does NOT exist (deprecated in Next.js 16)"
);

// ── 2. Proxy file gates /admin/* ──────────────────────────────────────────────
{
  const src = readFileSync(resolve(ROOT, "src/proxy.ts"), "utf8");

  assert(
    src.includes('pathname.startsWith("/admin")'),
    "middleware: /admin/* route check present (line ~95)"
  );
  assert(
    src.includes("admin_jwt"),
    "middleware: reads admin_jwt cookie"
  );
  assert(
    src.includes("verifyAdminCookie"),
    "middleware: calls verifyAdminCookie"
  );
  assert(
    src.includes("jwtVerify"),
    "middleware: uses jose jwtVerify (not manual decode)"
  );
  assert(
    src.includes("/admin/login"),
    "middleware: /admin/login is exempted from gate"
  );
  assert(
    src.includes('pathname.startsWith("/dashboard")'),
    "middleware: /dashboard/* also gated"
  );
  assert(
    src.includes('"/api/:path*"'),
    "middleware: /api/:path* in matcher config (rate limiting active)"
  );
}

// ── 3. Login API sets HttpOnly cookie ─────────────────────────────────────────
{
  const src = readFileSync(resolve(ROOT, "src/app/api/admin/login/route.ts"), "utf8");
  assert(
    src.includes("admin_jwt"),
    "login route: sets admin_jwt cookie"
  );
  assert(
    src.includes("httpOnly: true"),
    "login route: cookie is httpOnly"
  );
  assert(
    src.includes("sameSite"),
    "login route: cookie has sameSite"
  );
  assert(
    src.includes("maxAge: 8 * 60 * 60"),
    "login route: cookie expires in 8h (matches JWT)"
  );
}

// ── 4. Logout API exists and clears cookie ────────────────────────────────────
{
  const logoutPath = resolve(ROOT, "src/app/api/admin/logout/route.ts");
  assert(existsSync(logoutPath), "POST /api/admin/logout route exists");

  const src = readFileSync(logoutPath, "utf8");
  assert(
    src.includes("admin_jwt") && src.includes('maxAge: 0'),
    "logout route: expires admin_jwt cookie (maxAge: 0)"
  );
}

// ── 5. clearAdminSession calls logout endpoint ────────────────────────────────
{
  const src = readFileSync(resolve(ROOT, "src/lib/auth/adminSession.ts"), "utf8");
  assert(
    src.includes("/api/admin/logout"),
    "clearAdminSession: calls /api/admin/logout to clear server-side cookie"
  );
}

// ── 6. JWT uses correct issuer ─────────────────────────────────────────────────
{
  const src = readFileSync(resolve(ROOT, "src/lib/auth/adminJwt.ts"), "utf8");
  assert(
    src.includes("1nelink-admin"),
    "adminJwt: issuer is '1nelink-admin'"
  );
  assert(
    src.includes('"HS256"') || src.includes("'HS256'"),
    "adminJwt: uses HS256 (HMAC-SHA256)"
  );
  assert(
    src.includes('"8h"') || src.includes("'8h'"),
    "adminJwt: 8-hour expiry"
  );
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
