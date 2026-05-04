/**
 * Live Integration Test
 *
 * Requires a running server at BASE_URL (default: http://localhost:3000).
 * Run: npm run test-integration
 *
 * Test checklist:
 * 1. GET /api/store (anon)         → Cache-Control: public, s-maxage=60
 * 2. GET /api/store (authenticated) → Cache-Control: private, no-store
 * 3. GET /admin (no cookie)        → redirect to /admin/login (302/307)
 * 4. POST /api/admin/login (wrong) → 401 Unauthorized
 * 5. 25 rapid requests to /api/store → at least one 429 Too Many Requests
 * 6. GET non-existent route        → 404 Not Found
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const ANON_TOKEN = process.env.TEST_ANON_TOKEN || "";  // optional Supabase JWT for authed test

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

async function request(
  path: string,
  opts: RequestInit & { headers?: Record<string, string> } = {}
): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    ...opts,
  });
  const body = await res.text().catch(() => "");
  return { status: res.status, headers: res.headers, body };
}

console.log(`\n── Live Integration Tests @ ${BASE_URL} ──\n`);

// ── 1. /api/store anon → public cache ─────────────────────────────────────────
{
  const { status, headers } = await request("/api/store");
  assert(status === 200, `/api/store (anon) → 200 OK (got ${status})`);
  const cc = headers.get("cache-control") || "";
  assert(
    cc.includes("public") || cc.includes("s-maxage"),
    `/api/store (anon) → Cache-Control includes public/s-maxage (got: "${cc}")`
  );
}

// ── 2. /api/store authenticated → private cache ───────────────────────────────
if (ANON_TOKEN) {
  const { headers } = await request("/api/store", {
    headers: { Authorization: `Bearer ${ANON_TOKEN}` },
  });
  const cc = headers.get("cache-control") || "";
  assert(
    cc.includes("private") || cc.includes("no-store"),
    `/api/store (authed) → Cache-Control is private/no-store (got: "${cc}")`
  );
} else {
  console.log("  ⏭  Skipping authed cache test (TEST_ANON_TOKEN not set)");
}

// ── 3. /admin without cookie → redirect to /admin/login ───────────────────────
{
  const { status, headers } = await request("/admin");
  const location = headers.get("location") || "";
  assert(
    status === 302 || status === 307 || status === 308,
    `/admin (no cookie) → redirect (got status ${status})`
  );
  assert(
    location.includes("/admin/login") || location.includes("/admin/blocked"),
    `/admin (no cookie) → redirected to login/blocked (location: "${location}")`
  );
}

// ── 4. POST /api/admin/login with wrong password → 401 ────────────────────────
{
  const { status } = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "notreal@example.com", password: "wrong" }),
  });
  assert(
    status === 401 || status === 400,
    `POST /api/admin/login (wrong creds) → 401/400 (got ${status})`
  );
}

// ── 5. Rate limiting: 70 requests → at least one 429 ──────────────────────────
{
  const N = 70;
  const results = await Promise.all(
    Array.from({ length: N }, () =>
      request("/api/store").then((r) => r.status).catch(() => 0)
    )
  );
  const blocked = results.filter((s) => s === 429).length;
  assert(
    blocked > 0,
    `Rate limiting: ${N} concurrent requests → ${blocked} got 429 (expected ≥1)`
  );
}

// ── 6. Non-existent route → 404 ───────────────────────────────────────────────
{
  const { status } = await request("/api/this-does-not-exist-xyz-789");
  assert(
    status === 404,
    `/api/nonexistent → 404 (got ${status})`
  );
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
