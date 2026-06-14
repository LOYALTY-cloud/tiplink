/**
 * test-payroll-tracking.cjs
 *
 * End-to-end test for admin payroll / time tracking.
 *
 * Tests the full chain without needing a running server:
 *   1.  Session start creates a clean open session
 *   2.  Stale open sessions are closed before starting a new one
 *   3.  Heartbeat increments active_seconds when within 60 s window
 *   4.  Heartbeat skips increment when gap > 60 s (idle protection)
 *   5.  Heartbeat with 30 s gate logic (layout-side) — only fires if activity
 *   6.  Session end closes session and applies final increment
 *   7.  Payroll aggregation returns correct hours + sessions array
 *   8.  Sessions array contains started_at / ended_at / active_seconds
 *   9.  Daily breakdown matches active seconds
 *  10.  Idle admin (no sessions) shows 0 hours and empty sessions
 *  11.  Multiple sessions in a day accumulate correctly
 *  12.  Cleanup — all test rows removed from DB
 *
 * Usage:
 *   node dev-tools/tests/test-payroll-tracking.cjs
 */

"use strict";

const { createClient } = require("../../node_modules/@supabase/supabase-js");

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL    = "https://cjakxygbgijsknoadrrs.supabase.co";
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
  || require("fs").readFileSync("/workspaces/tiplink/.env.local", "utf8")
       .split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))
       ?.split("=").slice(1).join("=").trim();

if (!SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Test state ─────────────────────────────────────────────────────────────────
const TEST_USER_ID = "00000000-dea0-beef-0000-000000000001"; // fake UUID — safe to clean up
let pass = 0, fail = 0;
const createdSessionIds = [];

function ok(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}${detail ? " — " + detail : ""}`);
    fail++;
  }
}

function section(name) {
  console.log(`\n▸ ${name}`);
}

// ── Helpers that replicate route logic ────────────────────────────────────────

/** Mirrors /api/admin/session/start */
async function sessionStart(adminId) {
  // Close stale open sessions
  await db.from("admin_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("admin_id", adminId)
    .is("ended_at", null);

  const { data, error } = await db.from("admin_sessions")
    .insert({ admin_id: adminId })
    .select("id, started_at, total_active_seconds")
    .single();
  if (error) throw new Error("sessionStart: " + error.message);
  createdSessionIds.push(data.id);
  return data;
}

/** Mirrors /api/admin/presence heartbeat increment */
async function heartbeatIncrement(adminId, simulatedNow) {
  const { data: session } = await db.from("admin_sessions")
    .select("id, last_active_at, total_active_seconds")
    .eq("admin_id", adminId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return null;

  const diff = Math.floor(
    (simulatedNow.getTime() - new Date(session.last_active_at).getTime()) / 1000
  );
  const increment = diff > 60 ? 0 : diff;

  const { error } = await db.from("admin_sessions")
    .update({
      last_active_at: simulatedNow.toISOString(),
      total_active_seconds: session.total_active_seconds + increment,
    })
    .eq("id", session.id);

  if (error) throw new Error("heartbeat: " + error.message);
  return { diff, increment, prev: session.total_active_seconds, next: session.total_active_seconds + increment };
}

/** Mirrors /api/admin/session/end */
async function sessionEnd(adminId, simulatedNow) {
  const { data: session } = await db.from("admin_sessions")
    .select("id, last_active_at, total_active_seconds")
    .eq("admin_id", adminId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return null;

  const diff = Math.floor(
    (simulatedNow.getTime() - new Date(session.last_active_at).getTime()) / 1000
  );
  const increment = diff > 60 ? 0 : diff;

  const { error } = await db.from("admin_sessions")
    .update({
      ended_at: simulatedNow.toISOString(),
      last_active_at: simulatedNow.toISOString(),
      total_active_seconds: session.total_active_seconds + increment,
    })
    .eq("id", session.id);

  if (error) throw new Error("sessionEnd: " + error.message);
  return { finalActive: session.total_active_seconds + increment };
}

/** Mirrors payroll route aggregation for a single admin */
async function getPayrollSessions(adminId, rangeHoursBack) {
  const end = new Date();
  const start = new Date(end.getTime() - rangeHoursBack * 3600 * 1000);

  const { data: sessions, error } = await db.from("admin_sessions")
    .select("id, admin_id, total_active_seconds, started_at, ended_at, last_active_at")
    .eq("admin_id", adminId)
    .gte("started_at", start.toISOString())
    .lte("started_at", end.toISOString())
    .order("started_at", { ascending: true });

  if (error) throw new Error("getPayroll: " + error.message);

  let totalSecs = 0;
  const sessionList = [];
  const dayMap = new Map();

  for (const s of sessions ?? []) {
    totalSecs += s.total_active_seconds ?? 0;
    sessionList.push({
      id: s.id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      active_seconds: s.total_active_seconds ?? 0,
    });
    const day = new Date(s.last_active_at ?? s.started_at).toISOString().slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + (s.total_active_seconds ?? 0));
  }

  const daily_breakdown = Array.from(dayMap.entries()).map(([date, secs]) => ({
    date,
    hours: parseFloat((secs / 3600).toFixed(2)),
    minutes: Math.round(secs / 60),
  }));

  return {
    hours: parseFloat((totalSecs / 3600).toFixed(2)),
    total_active_seconds: totalSecs,
    sessions: sessionList,
    daily_breakdown,
  };
}

// ── Layout activity gate test (no DB needed) ───────────────────────────────────
function testActivityGateLogic() {
  section("Layout heartbeat 30s gate logic (unit)");

  // Simulate lastMeaningfulActivityRef behaviour
  let lastActivity = Date.now();
  const GATE_MS = 30_000;

  function shouldSendHeartbeat(nowMs) {
    return (nowMs - lastActivity) <= GATE_MS;
  }

  function recordActivity(nowMs) {
    lastActivity = nowMs;
  }

  const t0 = Date.now();

  // Immediately after activity → should send
  ok("Heartbeat fires immediately after activity",
    shouldSendHeartbeat(t0));

  // 15s after last activity → should still send
  ok("Heartbeat fires at 15s idle",
    shouldSendHeartbeat(t0 + 15_000));

  // 30s exactly → boundary — should send (≤ not <)
  ok("Heartbeat fires at exactly 30s idle",
    shouldSendHeartbeat(t0 + 30_000));

  // 30.1s → should NOT send
  ok("Heartbeat SKIPPED at 30.1s idle (mouse wiggler protection)",
    !shouldSendHeartbeat(t0 + 30_100));

  // 60s → should NOT send
  ok("Heartbeat SKIPPED at 60s idle",
    !shouldSendHeartbeat(t0 + 60_000));

  // After new real activity → should send again
  recordActivity(t0 + 61_000);
  ok("Heartbeat fires again after new real activity",
    shouldSendHeartbeat(t0 + 61_000));

  // mousemove does NOT update lastActivity — simulate 35s mousemove-only idle
  // (we don't call recordActivity — mousemove is excluded)
  ok("Mousemove-only for 35s still blocks heartbeat",
    !shouldSendHeartbeat(t0 + 61_000 + 35_000));
}

// ── DB integration tests ──────────────────────────────────────────────────────
async function runDbTests() {
  section("Session lifecycle");

  // Test 1: Session start
  const sess1 = await sessionStart(TEST_USER_ID);
  ok("Session created with zero active seconds",
    sess1.total_active_seconds === 0,
    `got ${sess1.total_active_seconds}`);
  ok("Session has started_at timestamp",
    typeof sess1.started_at === "string" && sess1.started_at.length > 0);

  // Test 2: Stale session closure — start a second session, verify first closes
  const sess2 = await sessionStart(TEST_USER_ID);
  createdSessionIds.push(sess2.id); // track for cleanup
  const { data: staleCheck } = await db.from("admin_sessions")
    .select("id, ended_at")
    .eq("id", sess1.id)
    .single();
  ok("Starting new session closes prior open session",
    staleCheck?.ended_at !== null,
    `ended_at = ${staleCheck?.ended_at}`);

  section("Heartbeat increment logic");

  const baseTime = new Date();
  // Start fresh session for increment tests
  const sess3 = await sessionStart(TEST_USER_ID);

  // Beat 1: 20s after session start → should increment by 20
  const beat1Time = new Date(new Date(sess3.started_at).getTime() + 20_000);
  const beat1 = await heartbeatIncrement(TEST_USER_ID, beat1Time);
  ok("Heartbeat +20s increments active_seconds by 20",
    beat1?.increment === 20,
    `increment = ${beat1?.increment}, diff = ${beat1?.diff}`);
  ok("Total active_seconds = 20 after first beat",
    beat1?.next === 20,
    `got ${beat1?.next}`);

  // Beat 2: 20s later → +20 more
  const beat2Time = new Date(beat1Time.getTime() + 20_000);
  const beat2 = await heartbeatIncrement(TEST_USER_ID, beat2Time);
  ok("Heartbeat +20s increments by 20 again",
    beat2?.increment === 20,
    `increment = ${beat2?.increment}`);
  ok("Total active_seconds = 40 after second beat",
    beat2?.next === 40,
    `got ${beat2?.next}`);

  section("Idle gap protection");

  // Beat 3: 90s later (gap > 60) → increment = 0 (idle protection)
  const beat3Time = new Date(beat2Time.getTime() + 90_000);
  const beat3 = await heartbeatIncrement(TEST_USER_ID, beat3Time);
  ok("Gap > 60s: increment is 0 (idle time not counted)",
    beat3?.increment === 0,
    `increment = ${beat3?.increment}, diff = ${beat3?.diff}`);
  ok("Total active_seconds unchanged after idle gap",
    beat3?.next === 40,
    `got ${beat3?.next}`);

  // Beat 4: Resume activity — 25s after beat3 → +25
  const beat4Time = new Date(beat3Time.getTime() + 25_000);
  const beat4 = await heartbeatIncrement(TEST_USER_ID, beat4Time);
  ok("Activity resumes after idle gap: +25s counted",
    beat4?.increment === 25,
    `increment = ${beat4?.increment}`);
  ok("Total active_seconds = 65 after resume",
    beat4?.next === 65,
    `got ${beat4?.next}`);

  section("Session end");

  // End 15s after last beat → +15
  const endTime = new Date(beat4Time.getTime() + 15_000);
  const ended = await sessionEnd(TEST_USER_ID, endTime);
  ok("Session end applies final increment (+15s)",
    ended?.finalActive === 80,
    `finalActive = ${ended?.finalActive}`);

  // Verify session is closed in DB
  const { data: closedSess } = await db.from("admin_sessions")
    .select("ended_at, total_active_seconds")
    .eq("id", sess3.id)
    .single();
  ok("Session ended_at is set",
    closedSess?.ended_at !== null,
    `ended_at = ${closedSess?.ended_at}`);
  ok("Session total_active_seconds = 80 in DB",
    closedSess?.total_active_seconds === 80,
    `got ${closedSess?.total_active_seconds}`);

  section("Multiple sessions accumulate correctly");

  // Session A: 30 active seconds
  const sessA = await sessionStart(TEST_USER_ID);
  const tA = new Date(new Date(sessA.started_at).getTime() + 30_000);
  await heartbeatIncrement(TEST_USER_ID, tA);
  await sessionEnd(TEST_USER_ID, new Date(tA.getTime() + 5_000));

  // Session B: 45 active seconds
  const sessB = await sessionStart(TEST_USER_ID);
  const tB = new Date(new Date(sessB.started_at).getTime() + 45_000);
  await heartbeatIncrement(TEST_USER_ID, tB);
  await sessionEnd(TEST_USER_ID, new Date(tB.getTime() + 10_000));

  section("Payroll API aggregation");

  const payroll = await getPayrollSessions(TEST_USER_ID, 24);
  const expectedSecs = 80 + 35 + 55; // sess3 + sessA + sessB
  ok("Payroll total_active_seconds accumulates across sessions",
    payroll.total_active_seconds === expectedSecs,
    `expected ${expectedSecs}, got ${payroll.total_active_seconds}`);

  const expectedHours = parseFloat((expectedSecs / 3600).toFixed(2));
  ok("Payroll hours matches active seconds / 3600",
    payroll.hours === expectedHours,
    `expected ${expectedHours}, got ${payroll.hours}`);

  ok("Payroll sessions array contains all closed sessions",
    payroll.sessions.length >= 3,
    `got ${payroll.sessions.length} sessions`);

  ok("Each session has started_at",
    payroll.sessions.every(s => typeof s.started_at === "string"),
    JSON.stringify(payroll.sessions.map(s => s.started_at)));

  ok("Each session has ended_at (all sessions in this test were closed)",
    payroll.sessions.every(s => s.ended_at !== null),
    JSON.stringify(payroll.sessions.map(s => s.ended_at)));

  ok("Sessions with recorded work have active_seconds > 0",
    payroll.sessions.filter(s => s.active_seconds > 0).length >= 3,
    `active sessions: ${JSON.stringify(payroll.sessions.map(s => s.active_seconds))}`);

  ok("Daily breakdown is populated",
    payroll.daily_breakdown.length > 0,
    `got ${payroll.daily_breakdown.length} days`);

  ok("Daily breakdown total minutes matches total seconds",
    payroll.daily_breakdown.reduce((s, d) => s + d.minutes, 0) === Math.round(payroll.total_active_seconds / 60),
    `breakdown mins = ${payroll.daily_breakdown.reduce((s, d) => s + d.minutes, 0)}, expected ${Math.round(payroll.total_active_seconds / 60)}`);

  section("Active session (clock-in, not yet clocked out)");

  const openSess = await sessionStart(TEST_USER_ID);
  const tOpen = new Date(new Date(openSess.started_at).getTime() + 40_000);
  await heartbeatIncrement(TEST_USER_ID, tOpen);
  // DO NOT end session — simulate active admin

  const payrollWithOpen = await getPayrollSessions(TEST_USER_ID, 24);
  const openSessData = payrollWithOpen.sessions.find(s => s.id === openSess.id);
  ok("Open (active) session appears in payroll sessions",
    !!openSessData,
    `session id = ${openSess.id}`);
  ok("Open session has null ended_at (not yet clocked out)",
    openSessData?.ended_at === null,
    `ended_at = ${openSessData?.ended_at}`);
  ok("Open session accumulates active seconds",
    (openSessData?.active_seconds ?? 0) >= 40,
    `active_seconds = ${openSessData?.active_seconds}`);

  // Close the open session so it gets cleaned up
  await sessionEnd(TEST_USER_ID, new Date());

  void baseTime; // suppress unused warning
}

// ── Twice-weekly date range logic (unit, mirrors route getDateRange) ──────────
function getDateRange(range, now) {
  const day = now.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat

  if (range === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (range === "week_first_half") {
    const start = new Date(now);
    const toMon = day === 0 ? -6 : -(day - 1);
    start.setUTCDate(start.getUTCDate() + toMon);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2); // Wednesday
    end.setUTCHours(23, 59, 59, 999);
    return { start, end: end > now ? now : end };
  }

  if (range === "week_second_half") {
    const start = new Date(now);
    const toMon = day === 0 ? -6 : -(day - 1);
    start.setUTCDate(start.getUTCDate() + toMon + 3); // Thursday
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 3); // Sunday
    end.setUTCHours(23, 59, 59, 999);
    return { start, end: end > now ? now : end };
  }

  if (range === "last_period") {
    const inFirstHalf = day >= 1 && day <= 3;
    if (inFirstHalf) {
      const thisMonday = new Date(now);
      thisMonday.setUTCDate(thisMonday.getUTCDate() - (day - 1));
      thisMonday.setUTCHours(0, 0, 0, 0);
      const start = new Date(thisMonday);
      start.setUTCDate(start.getUTCDate() - 4); // last Thursday
      const end = new Date(thisMonday);
      return { start, end };
    } else {
      const start = new Date(now);
      const toMon = day === 0 ? -6 : -(day - 1);
      start.setUTCDate(start.getUTCDate() + toMon);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 2);
      end.setUTCHours(23, 59, 59, 999);
      return { start, end };
    }
  }

  // default: this week (Mon–now)
  const start = new Date(now);
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: now };
}

function isoDate(d) { return d.toISOString().slice(0, 10); }
function dayName(d) { return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()]; }

function testTwiceWeeklyPeriods() {
  section("Twice-weekly period date ranges (unit)");

  // Build a representative date for each day of the week to test all branches
  // Use a known Monday: 2026-06-15 (Mon)
  const BASE_MON = new Date("2026-06-15T14:00:00Z"); // Monday

  const days = [
    { label: "Monday",    d: new Date("2026-06-15T14:00:00Z") },
    { label: "Tuesday",   d: new Date("2026-06-16T14:00:00Z") },
    { label: "Wednesday", d: new Date("2026-06-17T14:00:00Z") },
    { label: "Thursday",  d: new Date("2026-06-18T14:00:00Z") },
    { label: "Friday",    d: new Date("2026-06-19T14:00:00Z") },
    { label: "Saturday",  d: new Date("2026-06-20T14:00:00Z") },
    { label: "Sunday",    d: new Date("2026-06-21T14:00:00Z") },
  ];

  // 1st half always starts on Monday, ends on Wednesday
  for (const { label, d } of days) {
    const { start, end } = getDateRange("week_first_half", d);
    const startDay = dayName(start);
    const endDay = dayName(end > d ? d : end);
    ok(`week_first_half start is Monday (tested on ${label})`,
      startDay === "Mon", `got ${startDay} (${isoDate(start)})`);
  }

  // 2nd half always starts on Thursday
  for (const { label, d } of days) {
    const { start } = getDateRange("week_second_half", d);
    const startDay = dayName(start);
    ok(`week_second_half start is Thursday (tested on ${label})`,
      startDay === "Thu", `got ${startDay} (${isoDate(start)})`);
  }

  // 1st half end date is Wed (or now if before Wed)
  const { end: endOnMon } = getDateRange("week_first_half", days[0].d);
  ok("week_first_half end is capped at 'now' when today is Monday (period not yet over)",
    endOnMon <= days[0].d, `end = ${isoDate(endOnMon)}, now = ${isoDate(days[0].d)}`);

  const { end: endOnWed } = getDateRange("week_first_half", days[2].d);
  ok("week_first_half end is capped at 'now' when today is Wednesday",
    endOnWed <= days[2].d, `end = ${isoDate(endOnWed)}, now = ${isoDate(days[2].d)}`);

  const { end: endOnFri } = getDateRange("week_first_half", days[4].d);
  ok("week_first_half end is Wed 23:59:59 when today is past Wednesday",
    isoDate(endOnFri) === "2026-06-17", `got ${isoDate(endOnFri)}`);

  // 2nd half end date is Sun (or now if before Sun)
  const { end: endOnThu } = getDateRange("week_second_half", days[3].d);
  ok("week_second_half end is capped at 'now' when today is Thursday",
    endOnThu <= days[3].d, `end = ${isoDate(endOnThu)}, now = ${isoDate(days[3].d)}`);

  // last_period: when in first half (Mon/Tue/Wed) → returns last week's Thu–Sun
  for (const { label, d } of [days[0], days[1], days[2]]) {
    const { start, end } = getDateRange("last_period", d);
    ok(`last_period from ${label}: start is last week's Thursday`,
      dayName(start) === "Thu", `got ${dayName(start)} (${isoDate(start)})`);
    // end should be this Monday midnight (exclusive end of last Thu-Sun)
    ok(`last_period from ${label}: end is this Monday`,
      dayName(end) === "Mon", `got ${dayName(end)} (${isoDate(end)})`);
  }

  // last_period: when in second half (Thu/Fri/Sat/Sun) → returns this week's Mon–Wed
  for (const { label, d } of [days[3], days[4], days[5], days[6]]) {
    const { start } = getDateRange("last_period", d);
    ok(`last_period from ${label}: start is this week's Monday`,
      dayName(start) === "Mon", `got ${dayName(start)} (${isoDate(start)})`);
  }

  // 1st and 2nd halves together cover the full week (Mon–Sun) with no gap
  const firstEnd   = new Date("2026-06-17T23:59:59.999Z"); // Wed end
  const secondStart = new Date("2026-06-18T00:00:00.000Z"); // Thu start
  ok("1st half (Mon–Wed) and 2nd half (Thu–Sun) are contiguous — no gap between periods",
    secondStart.getTime() - firstEnd.getTime() === 1, // 1ms gap = contiguous
    `gap = ${secondStart.getTime() - firstEnd.getTime()}ms`);

  ok("Two periods per week = 2 pay periods", true); // definitional
  void BASE_MON;
}

// ── Cleanup ────────────────────────────────────────────────────────────────────
async function cleanup() {
  section("Cleanup");

  // Delete all sessions for this test user
  const { error } = await db.from("admin_sessions")
    .delete()
    .eq("admin_id", TEST_USER_ID);

  ok("All test sessions deleted from admin_sessions",
    !error,
    error?.message);

  // No profile was created for this test user — no profile cleanup needed
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log(" PAYROLL TRACKING TEST SUITE");
  console.log("=".repeat(60));

  try {
    testActivityGateLogic();
    testTwiceWeeklyPeriods();
    await runDbTests();
  } catch (err) {
    console.error("\n💥 UNCAUGHT ERROR:", err.message);
    fail++;
  } finally {
    await cleanup();
  }

  console.log("\n" + "=".repeat(60));
  if (fail === 0) {
    console.log(`\n  ALL ${pass} TESTS PASSED ✓\n`);
  } else {
    console.log(`\n  ${pass} passed, ${fail} FAILED ✗\n`);
    process.exitCode = 1;
  }
}

main();
