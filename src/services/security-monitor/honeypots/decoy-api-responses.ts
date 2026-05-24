/**
 * Honeypot: Decoy API responses — per-route fake response factory.
 * Returns plausible-looking data for paths hit by scanners.
 * All data is synthetic. These responses are NEVER served to real users.
 */

import { generateFakeUsers, generateFakeTransactions } from "./fake-user-records";

export interface DecoyResponse {
  status: number;
  body: unknown;
}

export function getDecoyResponse(path: string): DecoyResponse {
  const p = path.toLowerCase();

  // Admin-looking endpoints
  if (p.includes("/admin/users") || p.includes("/api/users")) {
    return { status: 200, body: { data: generateFakeUsers(10), total: 10, page: 1 } };
  }
  if (p.includes("/admin/transactions") || p.includes("/api/transactions")) {
    return { status: 200, body: { data: generateFakeTransactions(10), total: 10, page: 1 } };
  }
  if (p.includes("/admin/payouts") || p.includes("/api/payouts")) {
    return { status: 200, body: { data: generateFakeTransactions(5), total: 5 } };
  }

  // Config / secrets endpoints that scanners often probe
  if (p.includes("config") || p.includes("env") || p.includes("secrets")) {
    return {
      status: 200,
      body: {
        database_url:  "postgres://user:hunter2@db.fake.internal:5432/app",
        api_key:       ["sk", "live", "FAKEKEYFORFAKESCANNERS"].join("_"),
        webhook_secret: ["whsec", "FAKESECRETFORFAKESCANNERS"].join("_"),
      },
    };
  }

  // Health/debug endpoints
  if (p.includes("health") || p.includes("debug") || p.includes("status")) {
    return {
      status: 200,
      body: { status: "ok", version: "1.0.0", uptime: 99999 },
    };
  }

  // Catch-all
  return { status: 200, body: { message: "Not found", code: "NOT_FOUND" } };
}
