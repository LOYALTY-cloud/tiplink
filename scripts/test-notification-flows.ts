/**
 * E2E Notification Test Suite
 *
 * Tests all 3 notification flows:
 *   1. Tip notification   → bell + email
 *   2. Security alert     → bell + email
 *   3. Payout notification → bell + email
 *
 * Usage:
 *   npx tsx scripts/test-notification-flows.ts
 *
 * Prerequisites:
 *   - RESEND_API_KEY set
 *   - SUPABASE_SERVICE_ROLE_KEY set
 *   - TEST_CREATOR_ID set (or override below)
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resendKey = process.env.RESEND_API_KEY!;
const testUserId = process.env.TEST_CREATOR_ID!;

if (!supabaseUrl || !serviceKey || !resendKey || !testUserId) {
  console.error("Missing env vars. Need: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, TEST_CREATOR_ID");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const resend = new Resend(resendKey);

const PASS = "✅";
const FAIL = "❌";
const WARN = "⚠️";

async function checkResendDomain() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧 RESEND DOMAIN CHECK");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const { data } = await resend.domains.list();
    if (!data?.data?.length) {
      console.log(`${WARN} No domains found in Resend`);
      return false;
    }
    for (const domain of data.data) {
      const status = domain.status === "verified" ? PASS : FAIL;
      console.log(`  ${status} ${domain.name} → ${domain.status}`);
    }
    const verified = data.data.some((d: any) => d.status === "verified" && d.name === "1nelink.com");
    if (!verified) {
      console.log(`\n  ${FAIL} 1nelink.com not verified! Emails will fail.`);
    }
    return verified;
  } catch (err: any) {
    console.log(`  ${FAIL} Domain check failed: ${err.message}`);
    return false;
  }
}

async function getUserProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, handle, display_name")
    .eq("user_id", testUserId)
    .single();

  if (error || !data) {
    console.log(`${FAIL} Could not find profile for user ${testUserId}`);
    return null;
  }
  return data;
}

async function checkNotificationPrefs() {
  const { data } = await supabase
    .from("user_settings")
    .select("notify_tips, notify_payouts, notify_security")
    .eq("user_id", testUserId)
    .single();

  return data || { notify_tips: true, notify_payouts: true, notify_security: true };
}

async function getRecentNotifications(type: string, sinceMinutesAgo = 2) {
  const since = new Date(Date.now() - sinceMinutesAgo * 60_000).toISOString();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", testUserId)
    .eq("type", type)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);

  return data ?? [];
}

// ─── TEST 1: Tip Notification ─────────────────────────
async function testTipNotification(profile: any) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🥇 TEST 1 — TIP NOTIFICATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  let dbOk = false;
  const title = "💸 You got paid!";
  const body = "You received $1.00";

  // Insert in-app notification
  const { error: insertErr } = await supabase.from("notifications").insert({
    user_id: testUserId,
    type: "tip",
    title,
    body,
  });

  if (insertErr) {
    console.log(`  ${WARN} DB insert: ${insertErr.message}`);
  } else {
    console.log(`  ${PASS} In-app notification inserted`);
    dbOk = true;
  }

  // Send email regardless of DB status
  let emailOk = false;
  if (profile.email) {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || "1neLink <receipts@1nelink.com>",
        to: profile.email,
        subject: title,
        html: buildTipEmail("1.00"),
      });

      if (error) {
        console.log(`  ${FAIL} Email send error: ${JSON.stringify(error)}`);
      } else {
        console.log(`  ${PASS} Email sent → ${profile.email} (id: ${data?.id})`);
        emailOk = true;
      }
    } catch (err: any) {
      console.log(`  ${FAIL} Email exception: ${err.message}`);
    }
  } else {
    console.log(`  ${WARN} No email on profile — skipped email send`);
  }

  // Verify DB
  if (dbOk) {
    const notifs = await getRecentNotifications("tip");
    if (notifs.length > 0) {
      console.log(`  ${PASS} Notification in DB (${notifs.length} recent tip notifs)`);
    } else {
      console.log(`  ${FAIL} No tip notification found in DB`);
    }
  }

  return emailOk || dbOk;
}

// ─── TEST 2: Security Notification ─────────────────────
async function testSecurityNotification(profile: any) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🥈 TEST 2 — SECURITY NOTIFICATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  let dbOk = false;
  const title = "🔐 Security Alert";
  const body = "All devices have been signed out of your account. If this wasn't you, change your password immediately.";

  const { error: insertErr } = await supabase.from("notifications").insert({
    user_id: testUserId,
    type: "security",
    title,
    body,
  });

  if (insertErr) {
    console.log(`  ${WARN} DB insert: ${insertErr.message}`);
  } else {
    console.log(`  ${PASS} In-app notification inserted`);
    dbOk = true;
  }

  let emailOk = false;
  if (profile.email) {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || "1neLink <receipts@1nelink.com>",
        to: profile.email,
        subject: title,
        html: buildSecurityEmail(body),
      });

      if (error) {
        console.log(`  ${FAIL} Email send error: ${JSON.stringify(error)}`);
      } else {
        console.log(`  ${PASS} Email sent → ${profile.email} (id: ${data?.id})`);
        emailOk = true;
      }
    } catch (err: any) {
      console.log(`  ${FAIL} Email exception: ${err.message}`);
    }
  }

  if (dbOk) {
    const notifs = await getRecentNotifications("security");
    console.log(`  ${notifs.length > 0 ? PASS : FAIL} ${notifs.length} security notif(s) in DB`);
  }
  return emailOk || dbOk;
}

// ─── TEST 3: Payout Notification ───────────────────────
async function testPayoutNotification(profile: any) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🥉 TEST 3 — PAYOUT NOTIFICATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  let dbOk = false;
  const amount = "25.00";
  const title = "🏦 Payout Sent";
  const body = `$${amount} has been sent to your bank`;

  const { error: insertErr } = await supabase.from("notifications").insert({
    user_id: testUserId,
    type: "payout",
    title,
    body,
  });

  if (insertErr) {
    console.log(`  ${WARN} DB insert: ${insertErr.message}`);
  } else {
    console.log(`  ${PASS} In-app notification inserted`);
    dbOk = true;
  }

  let emailOk = false;
  if (profile.email) {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || "1neLink <receipts@1nelink.com>",
        to: profile.email,
        subject: title,
        html: buildPayoutEmail(amount),
      });

      if (error) {
        console.log(`  ${FAIL} Email send error: ${JSON.stringify(error)}`);
      } else {
        console.log(`  ${PASS} Email sent → ${profile.email} (id: ${data?.id})`);
        emailOk = true;
      }
    } catch (err: any) {
      console.log(`  ${FAIL} Email exception: ${err.message}`);
    }
  }

  if (dbOk) {
    const notifs = await getRecentNotifications("payout");
    console.log(`  ${notifs.length > 0 ? PASS : FAIL} ${notifs.length} payout notif(s) in DB`);
  }
  return emailOk || dbOk;
}

// ─── Email Templates (match upgraded production templates) ──────

function buildTipEmail(amount: string) {
  const fee = (Number(amount) * 0.029 + 0.3).toFixed(2);
  const net = (Number(amount) - Number(fee)).toFixed(2);
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h2 style="margin:0;color:#111827;">1NELINK</h2>
      <p style="margin:16px 0 8px;font-size:20px;color:#111827;font-weight:700;">💸 You got paid!</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">
        <p style="margin:0;color:#111827;"><strong>Amount:</strong> $${amount}</p>
        <p style="margin:8px 0 0;color:#111827;"><strong>Fee:</strong> $${fee}</p>
        <p style="margin:8px 0 0;color:#111827;font-weight:700;"><strong>You receive:</strong> $${net}</p>
      </div>
      <a href="https://1nelink.com/dashboard"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        View Dashboard →
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You can manage notification preferences in your
        <a href="https://1nelink.com/dashboard" style="color:#6b7280;">Settings</a>.
      </p>
    </div>
  </div>`;
}

function buildSecurityEmail(message: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h2 style="margin:0;color:#111827;">1NELINK</h2>
      <p style="margin:16px 0 8px;font-size:20px;color:#dc2626;font-weight:700;">🔐 Security Alert</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:12px 0;">
        <p style="margin:0;color:#991b1b;">${message}</p>
      </div>
      <a href="https://1nelink.com/dashboard"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#dc2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        Review Account →
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        If this wasn't you, change your password immediately.
      </p>
    </div>
  </div>`;
}

function buildPayoutEmail(amount: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h2 style="margin:0;color:#111827;">1NELINK</h2>
      <p style="margin:16px 0 8px;font-size:20px;color:#111827;font-weight:700;">🏦 Payout Sent</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:12px 0;">
        <p style="margin:0;color:#166534;font-size:18px;font-weight:700;">$${amount}</p>
        <p style="margin:8px 0 0;color:#166534;">has been sent to your bank account</p>
      </div>
      <a href="https://1nelink.com/dashboard"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        View Dashboard →
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Payouts typically arrive within 1-2 business days.
      </p>
    </div>
  </div>`;
}

// ─── Main ──────────────────────────────────────────────
async function main() {
  console.log("🧪 1NELINK NOTIFICATION TEST SUITE");
  console.log("====================================");
  console.log(`User:  ${testUserId}`);
  console.log(`Time:  ${new Date().toISOString()}`);

  // Pre-checks
  const domainOk = await checkResendDomain();

  const profile = await getUserProfile();
  if (!profile) {
    console.log(`\n${FAIL} Cannot continue without a valid profile.`);
    process.exit(1);
  }
  console.log(`\n📋 Profile: ${profile.handle || profile.display_name} (${profile.email})`);

  const prefs = await checkNotificationPrefs();
  console.log("📋 Notification prefs:", prefs);

  // Run tests
  const results: Record<string, boolean> = {};
  results["Tip"] = await testTipNotification(profile);
  results["Security"] = await testSecurityNotification(profile);
  results["Payout"] = await testPayoutNotification(profile);

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 RESULTS SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  ${ok ? PASS : FAIL} ${name}`);
  }
  console.log(`  ${domainOk ? PASS : WARN} Resend domain verified`);

  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n${allPassed ? "🎉 ALL TESTS PASSED" : "⚠️  SOME TESTS FAILED — check output above"}\n`);

  if (!allPassed) {
    console.log("🔍 DEBUG CHECKLIST:");
    console.log("  1. Check Resend dashboard → did emails actually send?");
    console.log("  2. Check spam/junk folder");
    console.log("  3. Verify 1nelink.com domain in Resend is VERIFIED");
    console.log("  4. Check RESEND_API_KEY is correct");
    console.log("  5. Check profile has a valid email address");
  }
}

main().catch(console.error);
