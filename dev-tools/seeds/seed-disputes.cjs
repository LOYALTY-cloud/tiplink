const { createClient } = require("@supabase/supabase-js");
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Clean up any previous test data
  const ids = ["test-probe-999","test-dispute-001","test-dispute-002","test-dispute-003","test-dispute-004"];
  await c.from("tip_intents").delete().in("receipt_id", ids);

  const { data: profiles } = await c.from("profiles").select("user_id, handle").limit(3);
  const uid1 = profiles[0].user_id;
  const uid2 = profiles[1].user_id;

  const disputes = [
    { receipt_id: "test-dispute-001", creator_user_id: uid1, tip_amount: 25.00, stripe_fee: 1.03, platform_fee: 0.50, total_charge: 26.53, refunded_amount: 25.00, refund_status: "full", stripe_payment_intent_id: "pi_test_dispute_001", status: "disputed", supporter_name: "Alex M.", message: "Great work!" },
    { receipt_id: "test-dispute-002", creator_user_id: uid1, tip_amount: 50.00, stripe_fee: 1.75, platform_fee: 1.00, total_charge: 52.75, refunded_amount: 50.00, refund_status: "full", stripe_payment_intent_id: "pi_test_dispute_002", status: "disputed", supporter_name: "Jordan P.", message: "Keep it up" },
    { receipt_id: "test-dispute-003", creator_user_id: uid1, tip_amount: 15.00, stripe_fee: 0.74, platform_fee: 0.30, total_charge: 16.04, refunded_amount: 15.00, refund_status: "full", stripe_payment_intent_id: "pi_test_dispute_003", status: "disputed", supporter_name: "Sam R." },
    { receipt_id: "test-dispute-004", creator_user_id: uid2, tip_amount: 100.00, stripe_fee: 3.20, platform_fee: 2.00, total_charge: 105.20, refunded_amount: 100.00, refund_status: "full", stripe_payment_intent_id: "pi_test_dispute_004", status: "disputed", supporter_name: "Casey L.", message: "Big fan" },
  ];

  const { data, error } = await c.from("tip_intents").insert(disputes).select("receipt_id, status, tip_amount");
  if (error) console.log("Insert error:", error.message);
  else console.log("Seeded", data.length, "disputed tips:", data);
}

main();
