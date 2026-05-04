const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_EMAIL = "moway44@gmail.com";

async function main() {
  // 1. Find user by email via profiles table
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("user_id, handle")
    .eq("email", TARGET_EMAIL)
    .single();

  if (profileErr || !profile) {
    console.error("Could not find profile for", TARGET_EMAIL, profileErr?.message);
    process.exit(1);
  }

  const userId = profile.user_id;
  console.log("Found user:", userId, "(handle:", profile.handle + ")");

  // 2. Clean up previous seed transactions
  const { error: delErr } = await supabase
    .from("transactions_ledger")
    .delete()
    .eq("user_id", userId)
    .like("meta->>seed", "seed-tx-%");

  if (delErr) console.warn("Cleanup warning:", delErr.message);

  // 3. Generate diverse fake transactions over the past 30 days
  const now = Date.now();
  const DAY = 86400000;

  const names = ["Alex M.", "Jordan K.", "Sam R.", "Casey T.", "Morgan L.", "Riley P.", "Jamie B.", "Quinn D.", "Taylor H.", "Avery S."];
  const messages = [
    "Great service, thanks!",
    "You're awesome 🎉",
    "Keep up the good work!",
    "Thanks for the help today",
    "Really appreciate you!",
    null,
    "Best barista in town ☕",
    null,
    "Amazing work on the project!",
    "Thanks for staying late 🙌",
  ];

  const txs = [];

  // --- Tips received (12 entries) ---
  for (let i = 0; i < 12; i++) {
    const amount = parseFloat((Math.random() * 45 + 5).toFixed(2)); // $5–$50
    const fee = parseFloat((amount * 0.029 + 0.30).toFixed(2));
    const net = parseFloat((amount - fee).toFixed(2));
    const isAnon = i % 5 === 0;
    txs.push({
      user_id: userId,
      type: "tip_received",
      amount,
      created_at: new Date(now - DAY * (30 - i * 2.5) + Math.random() * DAY * 0.5).toISOString(),
      meta: {
        seed: `seed-tx-tip-${i}`,
        fee,
        net,
        supporter_name: isAnon ? null : names[i % names.length],
        tipper_name: isAnon ? null : names[i % names.length],
        is_anonymous: isAnon,
        message: messages[i % messages.length],
        receipt_id: crypto.randomUUID(),
      },
    });
  }

  // --- Withdrawals (3 entries) ---
  const withdrawalAmounts = [75.00, 120.00, 45.50];
  for (let i = 0; i < 3; i++) {
    const amount = withdrawalAmounts[i];
    const fee = i === 0 ? 1.50 : 0; // instant has fee
    txs.push({
      user_id: userId,
      type: "withdrawal",
      amount: -amount,
      created_at: new Date(now - DAY * (25 - i * 10)).toISOString(),
      meta: {
        seed: `seed-tx-wd-${i}`,
        method: i === 0 ? "instant" : "standard",
        fee,
        net: parseFloat((amount - fee).toFixed(2)),
        currency: "usd",
      },
    });
  }

  // --- Withdrawal fees (1 entry) ---
  txs.push({
    user_id: userId,
    type: "withdrawal_fee",
    amount: -1.50,
    created_at: new Date(now - DAY * 25 + 1000).toISOString(),
    meta: { seed: "seed-tx-wdfee-0", method: "instant" },
  });

  // --- Platform fees (2 entries) ---
  for (let i = 0; i < 2; i++) {
    txs.push({
      user_id: userId,
      type: "platform_fee",
      amount: -parseFloat((Math.random() * 2 + 0.50).toFixed(2)),
      created_at: new Date(now - DAY * (20 - i * 8)).toISOString(),
      meta: { seed: `seed-tx-pf-${i}` },
    });
  }

  // --- Refund (1 entry) ---
  txs.push({
    user_id: userId,
    type: "tip_refunded",
    amount: -15.00,
    created_at: new Date(now - DAY * 7).toISOString(),
    meta: {
      seed: "seed-tx-refund-0",
      refund_status: "full",
      refund_type: "full",
      total_refunded: 15.00,
    },
  });

  // --- Adjustment (1 entry) ---
  txs.push({
    user_id: userId,
    type: "adjustment",
    amount: 5.00,
    created_at: new Date(now - DAY * 3).toISOString(),
    meta: { seed: "seed-tx-adj-0", reason: "Dispute resolved in your favor" },
  });

  // Sort by created_at
  txs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // 4. Insert
  const { data, error } = await supabase
    .from("transactions_ledger")
    .insert(txs)
    .select("id, type, amount, created_at");

  if (error) {
    console.error("Insert error:", error.message);
    process.exit(1);
  }

  console.log(`\n✅ Seeded ${data.length} transactions for ${TARGET_EMAIL}:\n`);
  for (const tx of data) {
    const sign = tx.amount >= 0 ? "+" : "";
    console.log(`  ${tx.type.padEnd(18)} ${sign}$${tx.amount.toFixed(2).padStart(8)}  ${tx.created_at.slice(0, 10)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
