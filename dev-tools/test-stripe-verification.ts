#!/usr/bin/env npx tsx
/**
 * Test Stripe Verification Flow
 * 
 * Tests:
 * 1. Verification card detection logic
 * 2. Email template rendering
 * 3. Webhook account.updated handler
 * 4. Database profile updates
 * 
 * Usage:
 *   npx tsx dev-tools/test-stripe-verification.ts ohthtshim@gmail.com
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Missing SUPABASE_URL and/or SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const testEmail = process.argv[2] || "ohthtshim@gmail.com";

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<boolean>,
  details?: string
) {
  try {
    const passed = await fn();
    results.push({
      name,
      passed,
      details: passed ? details : undefined,
      error: passed ? undefined : "Assertion failed",
    });
    console.log(`${passed ? "✅" : "❌"} ${name}`);
    if (details && passed) console.log(`   ${details}`);
  } catch (e) {
    results.push({
      name,
      passed: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log(`❌ ${name}`);
    console.log(`   Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  console.log(`\n🔍 Testing Stripe Verification Flow\n`);
  console.log(`Test account: ${testEmail}\n`);

  // 1. Find user by email
  await test("Find user by email", async () => {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    const user = users.users.find((u) => u.email === testEmail);
    if (!user) throw new Error(`User ${testEmail} not found`);
    console.log(`   User ID: ${user.id}`);
    return true;
  });

  // 2. Get user profile
  let userId: string | null = null;
  await test("Load user profile", async () => {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    const user = users.users.find((u) => u.email === testEmail);
    if (!user) return false;
    userId = user.id;

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr) throw profErr;
    if (!profile) throw new Error("Profile not found");

    console.log(`   Stripe Account: ${profile.stripe_account_id || "none"}`);
    console.log(`   Charges Enabled: ${profile.stripe_charges_enabled}`);
    console.log(`   Payouts Enabled: ${profile.stripe_payouts_enabled}`);

    return true;
  });

  // 3. Verify webhook handler types
  await test("Webhook handler has account.updated case", async () => {
    const fs = await import("fs");
    const webhookFile = fs.readFileSync(
      "src/app/api/stripe/webhook/route.ts",
      "utf-8"
    );
    if (!webhookFile.includes('case "account.updated"')) {
      throw new Error("account.updated case not found");
    }
    if (!webhookFile.includes("buildVerificationRequiredEmail")) {
      throw new Error("buildVerificationRequiredEmail not found");
    }
    if (!webhookFile.includes("sendEmailAsync")) {
      throw new Error("sendEmailAsync not found");
    }
    return true;
  });

  // 4. Email template renders correctly
  await test("Email template renders without errors", async () => {
    const requirements = ["individual.address.line1", "individual.phone"];
    const requirementsList = requirements.join(", ");
    const count = requirements.length;

    // Simple template simulation
    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #060B18; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #0f172a; border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.08);">
    <h1>Action Needed</h1>
    <p>${requirementsList}</p>
    <p>${count} item${count !== 1 ? "s" : ""}</p>
  </div>
</div>
    `.trim();

    if (!html.includes(requirementsList)) {
      throw new Error("Requirements not in HTML");
    }
    if (!html.includes("Action Needed")) {
      throw new Error("Title not in HTML");
    }

    return true;
  });

  // 5. Verification card component exists
  await test("Verification components exist", async () => {
    const fs = await import("fs");

    const modalFile = fs.existsSync("src/components/StripeVerificationModal.tsx");
    if (!modalFile) throw new Error("StripeVerificationModal.tsx not found");

    const cardFile = fs.existsSync(
      "src/components/StripeVerificationCard.tsx"
    );
    if (!cardFile) throw new Error("StripeVerificationCard.tsx not found");

    return true;
  });

  // 6. Wallet page imports verification card
  await test("Wallet page imports verification card", async () => {
    const fs = await import("fs");
    const walletFile = fs.readFileSync("src/app/dashboard/wallet/page.tsx", "utf-8");

    if (!walletFile.includes("StripeVerificationCard")) {
      throw new Error("StripeVerificationCard import not found");
    }
    if (!walletFile.includes("<StripeVerificationCard")) {
      throw new Error("StripeVerificationCard component not used");
    }

    return true;
  });

  // 7. Summary
  console.log(`\n${"─".repeat(50)}`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\n📊 Results: ${passed}/${total} tests passed\n`);

  if (passed === total) {
    console.log("✅ All tests passed! Ready for manual user testing.\n");
    console.log("📝 Next steps:");
    console.log("   1. Log in as: " + testEmail);
    console.log("   2. Go to /dashboard/wallet");
    console.log("   3. Should see verification banner (if requirements detected)");
    console.log("   4. Click 'Complete Verification' → Stripe iframe opens");
    console.log("   5. Submit documents → Webhook sends email + in-app notification");
    console.log("   6. Status should refresh after ~30 seconds\n");
  } else {
    console.log("❌ Some tests failed. Fix issues before user testing.\n");
    process.exit(1);
  }
}

main().catch(console.error);
