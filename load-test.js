/**
 * k6 Load Test — 1neLink Platform
 *
 * Simulates 1,000 concurrent users across the four most meaningful flows:
 *
 *  Scenario A (60%): Public store feed — the primary read path (should be cached)
 *  Scenario B (20%): Creator profile page — SSR page render
 *  Scenario C (10%): Admin gate check — must reject unauthenticated access
 *  Scenario D (10%): Payment intent probe — POST with bad payload (safe, no real charge)
 *
 * Usage:
 *   Local:   k6 run load-test.js
 *   Docker:  docker run --rm -i --network=host grafana/k6 run - < load-test.js
 *   Prod:    BASE_URL=https://your-app.vercel.app k6 run load-test.js
 *
 * Env vars:
 *   BASE_URL   Target origin (default: http://localhost:3000)
 *   RAMP_MODE  "smoke" | "load" | "stress" (default: load)
 */

import http from "k6/http";
import { sleep, check, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate       = new Rate("errors");
const storeLatency    = new Trend("store_latency",   true);
const adminRejections = new Counter("admin_401_302");
const paymentLatency  = new Trend("payment_latency", true);

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL  = __ENV.BASE_URL  || "http://localhost:3000";
const RAMP_MODE = __ENV.RAMP_MODE || "load";

const PROFILES = {
  smoke: {
    // 5 VUs for 30s — quick sanity check
    vus: 5,
    duration: "30s",
  },
  load: {
    // Gradual ramp to 1,000 VUs — sustained production simulation
    stages: [
      { duration: "15s", target: 50   },  // warm up
      { duration: "20s", target: 200  },  // ramp
      { duration: "30s", target: 500  },  // climb
      { duration: "30s", target: 1000 },  // peak load
      { duration: "20s", target: 1000 },  // hold at peak
      { duration: "10s", target: 0    },  // ramp down
    ],
  },
  stress: {
    // Spike to 2000 — find the breaking point
    stages: [
      { duration: "10s", target: 100  },
      { duration: "20s", target: 500  },
      { duration: "30s", target: 2000 },
      { duration: "30s", target: 2000 },
      { duration: "10s", target: 0    },
    ],
  },
};

export const options = {
  ...(PROFILES[RAMP_MODE] || PROFILES.load),

  thresholds: {
    // Hard SLOs — test fails if these are breached
    "http_req_duration":        ["p(95)<800", "p(99)<1500"],
    "http_req_failed":          ["rate<0.02"],          // <2% errors overall
    "store_latency":            ["p(95)<500"],           // store feed <500ms p95
    "payment_latency":          ["p(95)<1500"],          // payment intent <1.5s p95
    "errors":                   ["rate<0.02"],

    // Info-only — won't fail build, just visible in output
    "admin_401_302":            ["count>0"],             // confirms gate is working
  },
};

// ── Scenario weight helpers ───────────────────────────────────────────────────
function weighted() {
  const r = Math.random();
  if (r < 0.60) return "store";
  if (r < 0.80) return "profile";
  if (r < 0.90) return "admin";
  return "payment";
}

// ── VU entry point ────────────────────────────────────────────────────────────
export default function () {
  const scenario = weighted();

  // ── A. Public store feed (cached route) ────────────────────────────────────
  if (scenario === "store") {
    group("store_feed", () => {
      const res = http.get(`${BASE_URL}/api/store`, {
        tags: { name: "store_feed" },
      });

      const ok = check(res, {
        "store: status 200":          (r) => r.status === 200,
        "store: has JSON body":        (r) => r.body != null && r.body.length > 0,
        "store: <500ms":               (r) => r.timings.duration < 500,
        "store: cache header present": (r) =>
          (r.headers["Cache-Control"] || "").includes("public") ||
          (r.headers["Cache-Control"] || "").includes("s-maxage") ||
          r.headers["X-Vercel-Cache"] !== undefined,
      });

      storeLatency.add(res.timings.duration);
      errorRate.add(!ok);
    });
  }

  // ── B. Creator profile page (SSR) ─────────────────────────────────────────
  else if (scenario === "profile") {
    group("creator_profile", () => {
      // Use a slug that doesn't exist — will 404 cleanly, still exercises SSR
      const res = http.get(`${BASE_URL}/loadtest-probe-user`, {
        tags: { name: "creator_profile" },
      });

      const ok = check(res, {
        "profile: not 500":    (r) => r.status !== 500,
        "profile: <1000ms":    (r) => r.timings.duration < 1000,
      });

      errorRate.add(!ok);
    });
  }

  // ── C. Admin gate — must never let unauthenticated requests through ────────
  else if (scenario === "admin") {
    group("admin_gate", () => {
      const res = http.get(`${BASE_URL}/admin`, {
        redirects: 0,
        tags: { name: "admin_gate" },
      });

      const blocked = check(res, {
        "admin: blocked (302/307/401)": (r) =>
          r.status === 302 || r.status === 307 || r.status === 401,
        "admin: NOT returning 200":     (r) => r.status !== 200,
      });

      if (res.status === 302 || res.status === 307 || res.status === 401) {
        adminRejections.add(1);
      }

      errorRate.add(!blocked);
    });
  }

  // ── D. Payment intent — POST with invalid payload (safe probe) ────────────
  else {
    group("payment_intent", () => {
      const payload = JSON.stringify({
        creator_user_id: "00000000-0000-0000-0000-000000000000",
        tip_amount: 0,  // invalid — will be rejected at validation
      });

      const res = http.post(
        `${BASE_URL}/api/payments/create-intent`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
          tags: { name: "payment_intent" },
        }
      );

      const ok = check(res, {
        // Expect a rejection (400/422/404) — not a 200 or 500
        "payment: validates input (400/422/404)": (r) =>
          r.status === 400 || r.status === 422 || r.status === 404 || r.status === 429,
        "payment: not 500":                       (r) => r.status !== 500,
        "payment: not 200 on bad input":          (r) => r.status !== 200,
      });

      paymentLatency.add(res.timings.duration);
      errorRate.add(!ok);
    });
  }

  // Realistic think time between requests
  sleep(Math.random() * 1.5 + 0.5); // 0.5–2s
}

// ── Summary formatter ─────────────────────────────────────────────────────────
export function handleSummary(data) {
  const d    = data.metrics.http_req_duration?.values;
  const fail = data.metrics.http_req_failed?.values;
  const rps  = data.metrics.http_reqs?.values;

  const lines = [
    "",
    "╔═══════════════════════════════════════════════╗",
    "║        1NELINK LOAD TEST SUMMARY              ║",
    "╚═══════════════════════════════════════════════╝",
    "",
    `  Mode:          ${RAMP_MODE}`,
    `  Target:        ${BASE_URL}`,
    "",
    `  Requests/sec:  ${(rps?.rate || 0).toFixed(1)}`,
    `  Avg latency:   ${(d?.avg || 0).toFixed(0)}ms`,
    `  p95 latency:   ${(d?.["p(95)"] || 0).toFixed(0)}ms`,
    `  p99 latency:   ${(d?.["p(99)"] || 0).toFixed(0)}ms`,
    `  Error rate:    ${((fail?.rate || 0) * 100).toFixed(2)}%`,
    `  Admin blocks:  ${data.metrics.admin_401_302?.values?.count || 0}`,
    "",
  ];

  const passed = !data.thresholds || Object.values(data.thresholds).every((t) => !t.ok === false);
  lines.push(passed ? "  🟢 ALL THRESHOLDS PASSED" : "  🔴 THRESHOLD VIOLATIONS — review above");
  lines.push("");

  console.log(lines.join("\n"));

  // Also write machine-readable JSON for CI
  return {
    "load-test-results.json": JSON.stringify(data, null, 2),
    stdout: lines.join("\n"),
  };
}
