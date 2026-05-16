/**
 * test-temp-unfreeze.cjs
 *
 * Tests the temporary unfreeze feature end-to-end using the Supabase service
 * role client directly (no running Next.js server required).
 *
 * Scenarios:
 *  1. Column exists in profiles table
 *  2. Frozen account IS blocked when temp window is null
 *  3. Frozen account IS blocked when temp window is in the past
 *  4. Frozen account is ALLOWED when temp window is in the future
 *  5. auto-freeze guard skips re-freeze during active temp window
 *  6. Cleanup: restore original profile state
 */

"use strict";

const fs = require("fs");
const envContent = fs.readFileSync(".env.local", "utf-8");
envContent.split("\n").forEach((line) => {
  const idx = line.indexOf("=");
  if (idx > 0 && !line.startsWith("#")) {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let pass = 0;
let fail = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  pass++;
}

function ko(label, detail) {
  console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
  fail++;
}

// ─── soft-restrictions logic (mirror of src/lib/softRestrictions.ts) ──────────
function evalFreezeBlock(profile) {
  if (!profile.is_frozen) return false;
  const tempUntil = profile.temp_unfreeze_until ? new Date(profile.temp_unfreeze_until) : null;
  const tempActive = tempUntil && tempUntil > new Date();
  return !tempActive; // blocked when NOT in active temp window
}

// ─── auto-freeze guard logic (mirror of src/lib/autoFreeze.ts) ────────────────
function evalAutoFreezeGuard(profile) {
  if (profile.is_frozen) return false; // already frozen — skip
  if (
    profile.temp_unfreeze_until &&
    new Date(profile.temp_unfreeze_until) > new Date()
  )
    return false; // temp window active — skip
  return true; // would proceed with freeze
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Temp Unfreeze Feature Test ===\n");

  // ── 0. Find a test subject ─────────────────────────────────────────────────
  console.log("0. Locating test subject...");
  const { data: profiles, error: pErr } = await sb
    .from("profiles")
    .select("user_id, handle, is_frozen, freeze_reason, freeze_level, frozen_at, account_status, temp_unfreeze_until")
    .limit(10);

  if (pErr || !profiles?.length) {
    console.error("  ✗  Could not fetch profiles:", pErr?.message);
    process.exit(1);
  }

  // Prefer a user who is already frozen (real scenario); fallback to first user
  const subject = profiles.find((p) => p.is_frozen) ?? profiles[0];
  const wasAlreadyFrozen = !!subject.is_frozen;
  const originalState = { ...subject };

  console.log(
    `  Using: ${subject.handle ?? subject.user_id.slice(0, 8)} (was_frozen=${wasAlreadyFrozen})`
  );

  // ── 1. Column exists ───────────────────────────────────────────────────────
  console.log("\n1. Schema check...");
  // If the select above succeeded and temp_unfreeze_until is a key, the column exists
  if ("temp_unfreeze_until" in subject) {
    ok("temp_unfreeze_until column exists on profiles");
  } else {
    ko(
      "temp_unfreeze_until column missing — run migration 20260514_add_temp_unfreeze.sql"
    );
    console.error("\nAborting: apply the migration first, then re-run this test.\n");
    process.exit(1);
  }

  // ── 2. Ensure subject is frozen for the tests ──────────────────────────────
  console.log("\n2. Preparing test state (freeze subject)...");
  const { error: freezeErr } = await sb
    .from("profiles")
    .update({
      is_frozen: true,
      freeze_reason: "[test] suspicious activity",
      freeze_level: "soft",
      frozen_at: new Date().toISOString(),
      temp_unfreeze_until: null,
    })
    .eq("user_id", subject.user_id);

  if (freezeErr) {
    ko("Failed to set test freeze state", freezeErr.message);
    process.exit(1);
  }
  ok("Subject frozen for test");

  // ── 3. Blocked when temp_unfreeze_until is null ────────────────────────────
  console.log("\n3. Freeze block — no temp window...");
  {
    const { data: p } = await sb
      .from("profiles")
      .select("is_frozen, temp_unfreeze_until")
      .eq("user_id", subject.user_id)
      .single();

    if (evalFreezeBlock(p)) {
      ok("Withdrawal blocked when temp_unfreeze_until = null");
    } else {
      ko("Should be blocked but evalFreezeBlock returned false");
    }
  }

  // ── 4. Blocked when temp window is in the past ─────────────────────────────
  console.log("\n4. Freeze block — expired temp window...");
  {
    const expired = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    await sb
      .from("profiles")
      .update({ temp_unfreeze_until: expired })
      .eq("user_id", subject.user_id);

    const { data: p } = await sb
      .from("profiles")
      .select("is_frozen, temp_unfreeze_until")
      .eq("user_id", subject.user_id)
      .single();

    if (evalFreezeBlock(p)) {
      ok("Withdrawal blocked when temp window has expired");
    } else {
      ko("Should be blocked (expired window) but evalFreezeBlock returned false");
    }
  }

  // ── 5. Allowed when temp window is active ─────────────────────────────────
  console.log("\n5. Temp window active — withdrawal allowed...");
  {
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4h from now
    await sb
      .from("profiles")
      .update({ temp_unfreeze_until: future })
      .eq("user_id", subject.user_id);

    const { data: p } = await sb
      .from("profiles")
      .select("is_frozen, temp_unfreeze_until")
      .eq("user_id", subject.user_id)
      .single();

    if (!evalFreezeBlock(p)) {
      ok(`Withdrawal allowed with active window (expires ${new Date(future).toLocaleTimeString()})`);
    } else {
      ko("Should be allowed (active temp window) but evalFreezeBlock returned true");
    }
  }

  // ── 6. Auto-freeze guard: skips when temp window active ───────────────────
  console.log("\n6. Auto-freeze guard — skips re-freeze during temp window...");
  {
    // Simulate: account is NOT frozen (temp window cleared it) but still has temp_unfreeze_until
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const mockProfile = { is_frozen: false, temp_unfreeze_until: future };

    if (!evalAutoFreezeGuard(mockProfile)) {
      ok("Auto-freeze skips when temp window is active");
    } else {
      ko("Auto-freeze should skip during temp window but returned 'proceed'");
    }
  }

  // ── 7. Auto-freeze guard: proceeds when no temp window ────────────────────
  console.log("\n7. Auto-freeze guard — proceeds when no temp window...");
  {
    const mockProfile = { is_frozen: false, temp_unfreeze_until: null };
    if (evalAutoFreezeGuard(mockProfile)) {
      ok("Auto-freeze proceeds when temp_unfreeze_until is null");
    } else {
      ko("Auto-freeze should proceed but returned 'skip'");
    }
  }

  // ── 8. Auto-freeze guard: proceeds when temp window expired ───────────────
  console.log("\n8. Auto-freeze guard — proceeds when temp window expired...");
  {
    const expired = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30m ago
    const mockProfile = { is_frozen: false, temp_unfreeze_until: expired };
    if (evalAutoFreezeGuard(mockProfile)) {
      ok("Auto-freeze proceeds when temp window has expired");
    } else {
      ko("Auto-freeze should proceed (expired window) but returned 'skip'");
    }
  }

  // ── 9. Cleanup ─────────────────────────────────────────────────────────────
  console.log("\n9. Cleanup — restoring original state...");
  const { error: cleanupErr } = await sb
    .from("profiles")
    .update({
      is_frozen: wasAlreadyFrozen ? true : false,
      freeze_reason: wasAlreadyFrozen ? originalState.freeze_reason : null,
      freeze_level: wasAlreadyFrozen ? originalState.freeze_level : null,
      frozen_at: wasAlreadyFrozen ? originalState.frozen_at : null,
      account_status: originalState.account_status,
      temp_unfreeze_until: originalState.temp_unfreeze_until, // restore original (usually null)
    })
    .eq("user_id", subject.user_id);

  if (cleanupErr) {
    ko("Cleanup failed", cleanupErr.message);
  } else {
    ok(
      wasAlreadyFrozen
        ? "Restored: account left frozen (was frozen before test)"
        : "Restored: account unfrozen (was not frozen before test)"
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Result: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error("\nSome tests failed. Check output above.\n");
    process.exit(1);
  } else {
    console.log("\nAll tests passed.\n");
  }
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
