/**
 * Cache Headers Test
 *
 * Verifies that:
 * 1. Public store routes declare revalidate = 60
 * 2. /api/store sends public Cache-Control for anonymous requests
 * 3. /api/store sends private no-store for authenticated requests
 *
 * These are static analysis checks — no live server needed.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log("── Cache Headers Tests ──\n");

const ROOT = resolve(process.cwd());

// ── 1. hero-ads and marketplace have revalidate = 60 ──────────────────────────
for (const routePath of [
  "src/app/api/store/hero-ads/route.ts",
  "src/app/api/store/marketplace/route.ts",
]) {
  const src = readFileSync(resolve(ROOT, routePath), "utf8");
  assert(
    src.includes("export const revalidate = 60"),
    `${routePath}: export const revalidate = 60`
  );
}

// ── 2. /api/store route sets public cache for anonymous ────────────────────────
{
  const src = readFileSync(resolve(ROOT, "src/app/api/store/route.ts"), "utf8");
  assert(
    src.includes("public, s-maxage=60"),
    "/api/store: public s-maxage=60 for anonymous"
  );
  assert(
    src.includes("stale-while-revalidate=60"),
    "/api/store: stale-while-revalidate=60"
  );
  assert(
    src.includes("private, no-store"),
    "/api/store: private no-store for authenticated"
  );
  assert(
    src.includes("!userId"),
    "/api/store: conditional on userId presence"
  );
}

// ── 3. Storage uploads use correct cache headers ───────────────────────────────
{
  // Timestamped paths must use immutable 1-year cache
  const themeSrc = readFileSync(resolve(ROOT, "src/app/api/upload/route.ts"), "utf8");
  assert(
    themeSrc.includes('"31536000"') || themeSrc.includes("'31536000'"),
    "upload/route: theme-backgrounds uses 31536000 cache"
  );
  assert(
    themeSrc.includes('"3600"') || themeSrc.includes("'3600'"),
    "upload/route: avatar/banner paths use 3600 cache"
  );

  // Hero ads use unique timestamped paths → immutable
  const heroSrc = readFileSync(resolve(ROOT, "src/app/api/admin/store/hero-ads/upload/route.ts"), "utf8");
  assert(
    heroSrc.includes("31536000"),
    "hero-ads/upload: uses 31536000 cache"
  );

  // Store assets use fixed per-user paths → 1h cache
  const storeSrc = readFileSync(resolve(ROOT, "src/app/api/store/upload-asset/route.ts"), "utf8");
  assert(
    storeSrc.includes("3600"),
    "store/upload-asset: uses 3600 cache"
  );
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
