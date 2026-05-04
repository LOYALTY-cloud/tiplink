/**
 * Seed admin_overrides with realistic test cases.
 *
 * Usage:  node --env-file=.env.local seed-overrides.cjs
 *
 * Looks up real profiles from the DB so foreign keys are satisfied.
 */
const { createClient } = require("@supabase/supabase-js");

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // 1. Find existing profiles to use as targets + admin stand-ins
  const { data: profiles, error: pErr } = await c
    .from("profiles")
    .select("id, user_id, handle, display_name")
    .limit(5);

  if (pErr || !profiles?.length) {
    console.error("Cannot seed — no profiles found:", pErr?.message);
    process.exit(1);
  }

  // Use first profile's id as the admin actor and others as targets
  const adminId = profiles[0].user_id;
  const adminName = profiles[0].display_name || profiles[0].handle || "Admin";

  // We need at least 2 profiles; duplicate if only 1
  const targets = profiles.length >= 2 ? profiles.slice(1) : [profiles[0]];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 2. Clean up previous seed data
  await c.from("admin_overrides").delete().eq("reason", "[SEED] Test override");
  await c
    .from("admin_overrides")
    .delete()
    .like("reason", "[SEED]%");

  // 3. Build override records spanning every type & realistic scenarios
  const now = new Date();
  function daysAgo(d) {
    return new Date(now.getTime() - d * 86400000).toISOString();
  }

  const overrides = [
    // --- unflag ---
    {
      admin_id: adminId,
      target_user: targets[0].id,
      override_type: "unflag",
      previous_value: { is_flagged: true },
      new_value: { is_flagged: false },
      reason: "[SEED] False positive — user verified as legitimate creator",
      created_at: daysAgo(12),
    },
    {
      admin_id: adminId,
      target_user: pick(targets).id,
      override_type: "unflag",
      previous_value: { is_flagged: true },
      new_value: { is_flagged: false },
      reason: "[SEED] Reviewed by fraud team — cleared after ID check",
      created_at: daysAgo(8),
    },

    // --- manual_flag ---
    {
      admin_id: adminId,
      target_user: targets[0].id,
      override_type: "manual_flag",
      previous_value: { is_flagged: false },
      new_value: { is_flagged: true },
      reason: "[SEED] Suspicious tip pattern detected — flagged for investigation",
      created_at: daysAgo(14),
    },
    {
      admin_id: adminId,
      target_user: pick(targets).id,
      override_type: "manual_flag",
      previous_value: { is_flagged: false },
      new_value: { is_flagged: true },
      reason: "[SEED] Multiple chargebacks reported by payment processor",
      created_at: daysAgo(3),
    },

    // --- clear_restriction ---
    {
      admin_id: adminId,
      target_user: targets[0].id,
      override_type: "clear_restriction",
      previous_value: {
        account_status: "restricted",
        restricted_until: daysAgo(-7),
        status_reason: "Excessive chargebacks",
      },
      new_value: {
        account_status: "active",
        restricted_until: null,
        status_reason: null,
      },
      reason: "[SEED] Restriction period complete — good standing restored",
      created_at: daysAgo(5),
    },
    {
      admin_id: adminId,
      target_user: pick(targets).id,
      override_type: "clear_restriction",
      previous_value: {
        account_status: "restricted",
        restricted_until: daysAgo(-30),
        status_reason: "Policy violation",
      },
      new_value: {
        account_status: "active",
        restricted_until: null,
        status_reason: null,
      },
      reason: "[SEED] Appeal approved by senior admin after policy review",
      created_at: daysAgo(1),
    },

    // --- bypass_verification ---
    {
      admin_id: adminId,
      target_user: pick(targets).id,
      override_type: "bypass_verification",
      previous_value: {
        verification_required: true,
        verification_reason: "High-value withdrawal pending",
      },
      new_value: {
        verification_required: false,
        verification_reason: null,
      },
      reason: "[SEED] VIP creator — verified identity on file, skip re-check",
      created_at: daysAgo(6),
    },
    {
      admin_id: adminId,
      target_user: targets[0].id,
      override_type: "bypass_verification",
      previous_value: {
        verification_required: true,
        verification_reason: "Account reactivation",
      },
      new_value: {
        verification_required: false,
        verification_reason: null,
      },
      reason: "[SEED] Phone call verification completed — override document upload",
      created_at: daysAgo(2),
    },

    // --- override_risk_score ---
    {
      admin_id: adminId,
      target_user: targets[0].id,
      override_type: "override_risk_score",
      previous_value: {
        risk_score: 78,
        risk_level: "high",
        last_fraud_score: 82,
      },
      new_value: {
        risk_score: 0,
        risk_level: "low",
        last_fraud_score: 0,
      },
      reason: "[SEED] Risk engine false positive — user is a known partner",
      created_at: daysAgo(10),
    },
    {
      admin_id: adminId,
      target_user: pick(targets).id,
      override_type: "override_risk_score",
      previous_value: {
        risk_score: 55,
        risk_level: "medium",
        last_fraud_score: 60,
      },
      new_value: {
        risk_score: 0,
        risk_level: "low",
        last_fraud_score: 0,
      },
      reason: "[SEED] Manual audit complete — all tips legitimate after review",
      created_at: daysAgo(0),
    },

    // --- unlock_withdrawal ---
    {
      admin_id: adminId,
      target_user: targets[0].id,
      override_type: "unlock_withdrawal",
      previous_value: {
        withdrawal_locked: true,
        payout_hold_until: daysAgo(-3),
      },
      new_value: {
        withdrawal_locked: false,
        payout_hold_until: null,
      },
      reason: "[SEED] Hold period expired — releasing funds to creator",
      created_at: daysAgo(4),
    },
    {
      admin_id: adminId,
      target_user: pick(targets).id,
      override_type: "unlock_withdrawal",
      previous_value: {
        withdrawal_locked: true,
        payout_hold_until: daysAgo(-14),
      },
      new_value: {
        withdrawal_locked: false,
        payout_hold_until: null,
      },
      reason: "[SEED] Dispute resolved in creator's favor — unlock payout",
      created_at: daysAgo(7),
    },
  ];

  // 4. Insert
  const { data, error } = await c
    .from("admin_overrides")
    .insert(overrides)
    .select("id, override_type, reason, created_at");

  if (error) {
    console.error("Insert error:", error.message);
    process.exit(1);
  }

  console.log(`\n✅ Seeded ${data.length} admin override test cases:\n`);

  const typeCounts = {};
  for (const row of data) {
    typeCounts[row.override_type] = (typeCounts[row.override_type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`   ${type}: ${count}`);
  }
  console.log(`\n   Total: ${data.length}`);
  console.log(`   Admin: ${adminName} (${adminId.slice(0, 8)}…)`);
  console.log(`   Targets: ${targets.map((t) => t.handle || t.id.slice(0, 8)).join(", ")}`);
}

main();
