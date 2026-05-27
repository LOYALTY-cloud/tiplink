#!/usr/bin/env node
/**
 * check-migration.cjs
 * Quick script to verify store_disabled_until/reason columns exist.
 * Run: node dev-tools/scripts/check-migration.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");

// Load .env.local
const envPath = path.resolve(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const { createClient } = require("@supabase/supabase-js");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

(async () => {
  const { data, error } = await admin
    .from("profiles")
    .select("store_disabled, store_disabled_until, store_disabled_reason")
    .limit(1);

  if (error) {
    console.log("❌ Migration NOT applied:", error.message);
    console.log("\nRun this SQL in the Supabase SQL Editor:");
    console.log("  https://supabase.com/dashboard/project/cjakxygbgijsknoadrrs/sql/new\n");
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260526_store_disabled_details.sql"),
      "utf8"
    );
    console.log(sql);
  } else {
    console.log("✅ Migration applied — all 3 store_disabled columns exist.");
    console.log("   store_disabled        ✓");
    console.log("   store_disabled_until  ✓");
    console.log("   store_disabled_reason ✓");
  }
})();
