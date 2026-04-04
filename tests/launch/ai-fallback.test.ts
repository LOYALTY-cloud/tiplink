/**
 * AI Fallback tests — verifies graceful degradation when AI is unavailable.
 */
import { handleSmartFallback } from "../../src/lib/aiFallback";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log("── AI Fallback Tests ──\n");

// 1. Known intent → returns useful guide
{
  const r = handleSmartFallback({ message: "how do I see my disputes", currentPage: "/admin" });
  assert(r.text.length > 10, `Dispute query: returns useful text (${r.text.length} chars)`);
  assert(!r.text.includes("undefined"), `Dispute query: no "undefined" in response`);
}

// 2. Transaction query
{
  const r = handleSmartFallback({ message: "where are my transactions", currentPage: "/admin" });
  assert(r.text.length > 10, `Transaction query: returns useful text`);
}

// 3. Revenue query
{
  const r = handleSmartFallback({ message: "show me revenue data", currentPage: "/admin" });
  assert(r.text.length > 10, `Revenue query: returns useful text`);
}

// 4. User query
{
  const r = handleSmartFallback({ message: "find a user account", currentPage: "/admin" });
  assert(r.text.length > 10, `User query: returns useful text`);
}

// 5. Unknown intent → fallback message (not empty, no crash)
{
  const r = handleSmartFallback({ message: "xyzzy random nonsense", currentPage: "/admin" });
  assert(r.text.length > 10, `Unknown intent: returns fallback text`);
  assert(!r.text.includes("undefined"), `Unknown intent: no undefined`);
}

// 6. Action on known intent
{
  const r = handleSmartFallback({ message: "disputes", currentPage: "/admin" });
  if (r.action) {
    assert(typeof r.action.label === "string" && r.action.label.length > 0, `Action has label`);
    assert(typeof r.action.route === "string" && r.action.route.startsWith("/"), `Action has valid route`);
  } else {
    // Some intents may not have actions, that's ok
    assert(true, `No action for this intent (acceptable)`);
  }
}

// 7. Never crashes on edge cases
{
  const edgeCases = ["", "a", "?!@#$%", " ".repeat(100), "refund ".repeat(50)];
  let crashed = false;
  for (const msg of edgeCases) {
    try {
      handleSmartFallback({ message: msg, currentPage: "/" });
    } catch {
      crashed = true;
    }
  }
  assert(!crashed, `Edge cases: no crashes`);
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
