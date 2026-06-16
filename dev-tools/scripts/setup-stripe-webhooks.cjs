/**
 * Stripe Webhook Setup Script
 * Registers both platform and Connect webhook endpoints.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node dev-tools/scripts/setup-stripe-webhooks.cjs
 *
 * Set WEBHOOK_URL to override the default production URL.
 */

const fs = require("fs");
const path = require("path");

// Load .env.local if present (dev fallback)
try {
  const envFile = path.resolve(__dirname, "../../.env.local");
  const lines = fs.readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const Stripe = require("stripe");
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set");
  process.exit(1);
}

const isLive = STRIPE_KEY.startsWith("sk_live_");
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://1nelink.com/api/stripe/webhook";

console.log(`\n🔧 Stripe Webhook Setup`);
console.log(`   Mode:        ${isLive ? "🟢 LIVE" : "🟡 TEST"}`);
console.log(`   Webhook URL: ${WEBHOOK_URL}\n`);

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2025-02-24.acacia" });

// All event types the webhook handler processes
const PLATFORM_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "refund.created",
  "charge.refunded",
  "payout.paid",
  "payout.failed",
  "review.opened",
  "review.closed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed",
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
];

const CONNECT_EVENTS = [
  "account.updated",
  "account.application.deauthorized",
  "account.external_account.updated",
  "capability.updated",
  "person.updated",
  "payout.paid",
  "payout.failed",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
];

async function setupWebhooks() {
  // List existing endpoints
  const existing = await stripe.webhookEndpoints.list({ limit: 20 });
  console.log(`Found ${existing.data.length} existing webhook endpoint(s):`);
  existing.data.forEach(ep => {
    console.log(`  ${ep.livemode ? "🟢" : "🟡"} ${ep.url} [${ep.status}]${ep.application ? " (Connect)" : ""}`);
  });

  // Check if platform endpoint already exists
  const platformExists = existing.data.find(ep =>
    ep.url === WEBHOOK_URL && !ep.application
  );
  const connectExists = existing.data.find(ep =>
    ep.url === WEBHOOK_URL && !!ep.application
  );

  let platformSecret = null;
  let connectSecret = null;

  // ── Platform webhook ─────────────────────────────────────────────────────
  if (platformExists) {
    console.log(`\n⚠️  Platform webhook already exists (${platformExists.id})`);
    console.log(`   Status: ${platformExists.status}`);
    if (platformExists.status !== "enabled") {
      await stripe.webhookEndpoints.update(platformExists.id, { disabled: false });
      console.log("   ✅ Re-enabled");
    }
    // Update events in case new ones were added
    await stripe.webhookEndpoints.update(platformExists.id, {
      enabled_events: PLATFORM_EVENTS,
    });
    console.log(`   ✅ Events updated (${PLATFORM_EVENTS.length} events)`);
    console.log(`   ℹ️  To get the signing secret: Stripe Dashboard → Webhooks → ${platformExists.id} → Reveal`);
  } else {
    console.log(`\n📌 Creating platform webhook endpoint...`);
    const ep = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      enabled_events: PLATFORM_EVENTS,
      description: "1neLink platform webhook",
    });
    platformSecret = ep.secret;
    console.log(`   ✅ Created: ${ep.id}`);
    console.log(`   🔑 Signing secret: ${ep.secret}`);
    console.log(`   ⚠️  COPY THIS NOW — it won't be shown again!`);
  }

  // ── Connect webhook ──────────────────────────────────────────────────────
  if (connectExists) {
    console.log(`\n⚠️  Connect webhook already exists (${connectExists.id})`);
    console.log(`   Status: ${connectExists.status}`);
    if (connectExists.status !== "enabled") {
      await stripe.webhookEndpoints.update(connectExists.id, { disabled: false });
      console.log("   ✅ Re-enabled");
    }
    await stripe.webhookEndpoints.update(connectExists.id, {
      enabled_events: CONNECT_EVENTS,
    });
    console.log(`   ✅ Events updated (${CONNECT_EVENTS.length} events)`);
    console.log(`   ℹ️  To get the signing secret: Stripe Dashboard → Webhooks → ${connectExists.id} → Reveal`);
  } else {
    console.log(`\n📌 Creating Connect webhook endpoint...`);
    const ep = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      enabled_events: CONNECT_EVENTS,
      connect: true,
      description: "1neLink Connect webhook (creator account events)",
    });
    connectSecret = ep.secret;
    console.log(`   ✅ Created: ${ep.id}`);
    console.log(`   🔑 Signing secret: ${ep.secret}`);
    console.log(`   ⚠️  COPY THIS NOW — it won't be shown again!`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Webhook setup complete!\n`);

  if (platformSecret || connectSecret) {
    console.log(`Set these in Vercel → Project → Settings → Environment Variables:\n`);
    if (platformSecret) console.log(`  STRIPE_WEBHOOK_SECRET=${platformSecret}`);
    if (connectSecret)  console.log(`  STRIPE_CONNECT_WEBHOOK_SECRET=${connectSecret}`);
    console.log(`\nThen redeploy for the changes to take effect.`);
  } else {
    console.log(`ℹ️  Both endpoints already existed. No new secrets generated.`);
    console.log(`If tips are still not processing, verify STRIPE_WEBHOOK_SECRET`);
    console.log(`and STRIPE_CONNECT_WEBHOOK_SECRET match the endpoint secrets in`);
    console.log(`Stripe Dashboard → Webhooks → [endpoint] → Signing secret.`);
  }
  console.log(`${"─".repeat(60)}\n`);
}

setupWebhooks().catch(err => {
  console.error("❌ Setup failed:", err.message);
  process.exit(1);
});
