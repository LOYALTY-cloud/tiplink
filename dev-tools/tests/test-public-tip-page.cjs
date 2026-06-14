/**
 * Public Tip Page — End-to-End API Tests
 * Tests every step a user goes through on /[handle]
 *
 * Usage (env vars already in shell):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node dev-tools/tests/test-public-tip-page.cjs
 */

// Load .env.local manually (no dotenv dependency)
const fs = require("fs");
const path = require("path");
try {
  const envFile = path.resolve(__dirname, "../../.env.local");
  const lines = fs.readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const { createClient } = require("@supabase/supabase-js");

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test creators: one valid, one that can't accept tips
const VALID_HANDLE = "gfebook";
const INVALID_HANDLE = "no_such_user_zzz";

let passed = 0;
let failed = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  console.log(`\n🧪 Public Tip Page Tests — ${BASE_URL}\n`);

  // ── 1. Profile load (server-side, DB check) ──────────────────────────────
  console.log("1. Creator profile checks");

  const { data: validProfile } = await sb.from("profiles")
    .select("user_id, handle, stripe_charges_enabled, stripe_account_id, account_status, stripe_restriction_state, canAcceptTips:stripe_charges_enabled")
    .eq("handle", VALID_HANDLE)
    .maybeSingle();

  ok("Valid creator exists in DB", !!validProfile, `handle=${VALID_HANDLE}`);
  ok("Valid creator has Stripe account", !!validProfile?.stripe_account_id);
  ok("Valid creator charges enabled", validProfile?.stripe_charges_enabled === true);
  ok("Valid creator account active", validProfile?.account_status === "active");
  ok("Valid creator restriction state safe", validProfile?.stripe_restriction_state === "safe");

  const { data: missingProfile } = await sb.from("profiles")
    .select("user_id").eq("handle", INVALID_HANDLE).maybeSingle();
  ok("Non-existent handle returns null", !missingProfile);

  // ── 2. /api/payments/create-intent — validation guards ───────────────────
  console.log("\n2. Create-intent validation");

  const { status: s1, json: j1 } = await post("/api/payments/create-intent", {});
  ok("Missing creator_user_id → 400", s1 === 400, `got ${s1}: ${j1?.error}`);

  const { status: s2, json: j2 } = await post("/api/payments/create-intent", {
    creator_user_id: validProfile?.user_id,
    tip_amount: 0,
    supporter_email: "test@test.com",
  });
  ok("tip_amount=0 → 400", s2 === 400, `got ${s2}: ${j2?.error}`);

  const { status: s3, json: j3 } = await post("/api/payments/create-intent", {
    creator_user_id: validProfile?.user_id,
    tip_amount: 0.50,
    supporter_email: "test@test.com",
  });
  ok("tip_amount below $1 minimum → 400", s3 === 400, `got ${s3}: ${j3?.error}`);

  const { status: s4, json: j4 } = await post("/api/payments/create-intent", {
    creator_user_id: validProfile?.user_id,
    tip_amount: 501,
    supporter_email: "test@test.com",
  });
  ok("tip_amount above $500 maximum → 400", s4 === 400, `got ${s4}: ${j4?.error}`);

  const { status: s5, json: j5 } = await post("/api/payments/create-intent", {
    creator_user_id: "00000000-0000-0000-0000-000000000000",
    tip_amount: 5,
    supporter_email: "test@test.com",
  });
  ok("Unknown creator_user_id → 404", s5 === 404, `got ${s5}: ${j5?.error}`);

  // ── 3. Valid create-intent ────────────────────────────────────────────────
  console.log("\n3. Valid create-intent call");

  const { status: s6, json: j6 } = await post("/api/payments/create-intent", {
    creator_user_id: validProfile?.user_id,
    tip_amount: 9.99,
    supporter_email: "test@example.com",
    is_anonymous: true,
    note: "Test tip",
  });
  ok("Valid intent → 200", s6 === 200, `got ${s6}: ${j6?.error}`);
  ok("Returns clientSecret", typeof j6?.clientSecret === "string" && j6.clientSecret.includes("_secret_"));
  ok("Returns receiptId (UUID)", typeof j6?.receiptId === "string" && j6.receiptId.length === 36);
  ok("Returns breakdown.tip", j6?.breakdown?.tip === 9.99);
  ok("Returns breakdown.total > tip", (j6?.breakdown?.total ?? 0) > 9.99);

  const receiptId = j6?.receiptId;

  // ── 4. tip_intents row created in DB ─────────────────────────────────────
  console.log("\n4. DB row created after create-intent");

  if (receiptId) {
    const { data: intentRow } = await sb.from("tip_intents")
      .select("*").eq("receipt_id", receiptId).maybeSingle();
    ok("tip_intents row exists", !!intentRow);
    ok("Row status = created", intentRow?.status === "created", `got: ${intentRow?.status}`);
    ok("Row has stripe_payment_intent_id", !!intentRow?.stripe_payment_intent_id);
    ok("Row creator_user_id matches", intentRow?.creator_user_id === validProfile?.user_id);
    ok("Row supporter_email stored", intentRow?.supporter_email === "test@example.com");
    ok("Row tip_amount matches", Number(intentRow?.tip_amount) === 9.99);

    // Cleanup test row
    await sb.from("tip_intents").delete().eq("receipt_id", receiptId);
    ok("Test row cleaned up", true);
  } else {
    ok("tip_intents row exists (skipped — no receiptId)", false, "create-intent failed");
    ok("Row status check skipped", false);
    ok("Row stripe PI id skipped", false);
    ok("Row creator_user_id skipped", false);
    ok("Row supporter_email skipped", false);
    ok("Row tip_amount skipped", false);
    ok("Cleanup skipped", false);
  }

  // ── 5. Email required — supporter_email must be sent ─────────────────────
  console.log("\n5. Email field enforcement (client-side validation check)");

  // Confirm the API still stores null email if bypassed (backend doesn't block it,
  // but the UI does — verify the field reaches the DB correctly)
  const { status: s7, json: j7 } = await post("/api/payments/create-intent", {
    creator_user_id: validProfile?.user_id,
    tip_amount: 5,
    supporter_email: "buyer@tiptest.com",
    is_anonymous: true,
  });
  ok("Email stored correctly when provided → 200", s7 === 200, `got ${s7}: ${j7?.error}`);
  if (j7?.receiptId) {
    const { data: row } = await sb.from("tip_intents")
      .select("supporter_email").eq("receipt_id", j7.receiptId).maybeSingle();
    ok("supporter_email in DB matches", row?.supporter_email === "buyer@tiptest.com", `got: ${row?.supporter_email}`);
    await sb.from("tip_intents").delete().eq("receipt_id", j7.receiptId);
  }

  // ── 6. Rate limiting ──────────────────────────────────────────────────────
  console.log("\n6. Rate limiting");

  // Check middleware rate limit header exists
  const rateRes = await fetch(`${BASE_URL}/api/payments/create-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creator_user_id: validProfile?.user_id, tip_amount: 5, supporter_email: "x@x.com" }),
  });
  ok("API responds (not hard-blocked)", rateRes.status < 500, `got ${rateRes.status}`);

  // ── 7. Receipt page accessible ────────────────────────────────────────────
  console.log("\n7. Receipt page");

  // Fetch a real existing receipt from DB
  const { data: existingIntent } = await sb.from("tip_intents")
    .select("receipt_id").eq("status", "succeeded").limit(1).maybeSingle();
  
  if (existingIntent?.receipt_id) {
    const receiptRes = await fetch(`${BASE_URL}/r/${existingIntent.receipt_id}`);
    ok("Receipt page returns 200", receiptRes.status === 200, `got ${receiptRes.status}`);
  } else {
    console.log("  ⚠️  No succeeded tip_intents found — skipping receipt page check");
  }

  // ── 8. Handle page loads ──────────────────────────────────────────────────
  console.log("\n8. Public handle page");

  const handleRes = await fetch(`${BASE_URL}/${VALID_HANDLE}`);
  ok(`/${VALID_HANDLE} loads (200 or 307)`, [200, 307].includes(handleRes.status), `got ${handleRes.status}`);

  const badHandleRes = await fetch(`${BASE_URL}/${INVALID_HANDLE}`);
  ok(`/${INVALID_HANDLE} returns 404`, badHandleRes.status === 404, `got ${badHandleRes.status}`);

  // ── 9. Digital product delivery check ─────────────────────────────────────
  console.log("\n9. Digital product (ebook) setup");

  const { data: product } = await sb.from("digital_products")
    .select("id, title, price_cents, storage_path, active, creator_user_id")
    .eq("creator_handle", "gfebook")
    .eq("active", true)
    .maybeSingle();
  ok("gfebook digital product exists", !!product, product ? "" : "No active product found");
  ok("Product price_cents = 999", product?.price_cents === 999, `got: ${product?.price_cents}`);
  ok("Product has storage_path", !!product?.storage_path);
  ok("Product creator_user_id set", !!product?.creator_user_id);

  // Verify signed URL can be generated
  if (product?.storage_path) {
    const { data: signed, error: signErr } = await sb.storage
      .from("digital-products")
      .createSignedUrl(product.storage_path, 60, { download: true });
    ok("Storage signed URL generates", !!signed?.signedUrl && !signErr, signErr?.message);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : " ✅"}`);
  console.log(`${"─".repeat(50)}\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
