/**
 * Owner AI router tests — verifies deterministic intent mapping for the owner AI control brain.
 */
import {
  detectOwnerAiIntent,
  extractAdminId,
  OWNER_AI_HELP_REPLY,
} from "../../src/lib/ai/ownerRouter";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log("── Owner AI Router Tests ──\n");

console.log("▸ Intent routing");
{
  const critical = detectOwnerAiIntent("show critical alerts");
  assert(critical.tool === "critical_alerts", "critical alert prompt routes to critical_alerts");

  const summary = detectOwnerAiIntent("give me today's summary");
  assert(summary.tool === "today_summary", "today summary prompt routes to today_summary");

  const approvals = detectOwnerAiIntent("what approvals need owner action?");
  assert(approvals.tool === "owner_approvals", "approval prompt routes to owner_approvals");

  const approvals2 = detectOwnerAiIntent("show owner required refunds");
  assert(approvals2.tool === "owner_approvals", "owner required prompt routes to owner_approvals");

  const activity = detectOwnerAiIntent("activity for admin admin_123");
  assert(activity.tool === "admin_activity", "activity prompt routes to admin_activity");
  assert(activity.adminId === "admin_123", "activity prompt extracts admin id");

  const fallback = detectOwnerAiIntent("how are things looking?");
  assert(fallback.tool === "help", "unknown prompt falls back to help");
}

console.log("\n▸ Admin ID extraction");
{
  assert(extractAdminId("activity for admin alpha_77") === "alpha_77", "extracts explicit activity-for-admin pattern");
  assert(extractAdminId("show admin bravo99 activity") === "bravo99", "extracts admin before activity pattern");
  assert(extractAdminId("activity for admin: charlie_42") === "charlie_42", "extracts admin id with colon pattern");
  assert(extractAdminId("show me alerts") === null, "returns null when no admin id exists");
}

console.log("\n▸ Help message");
{
  assert(OWNER_AI_HELP_REPLY.includes("owner approvals"), "help reply includes owner approvals guidance");
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);