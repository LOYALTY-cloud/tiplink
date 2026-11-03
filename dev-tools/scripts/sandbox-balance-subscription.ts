/**
 * Sandbox demo: a real Stripe Billing subscription to the "Blue theme" product whose
 * invoices are paid from a connected account's Stripe balance.
 *
 *   npx tsx dev-tools/scripts/sandbox-balance-subscription.ts [creator-email]
 *
 * Stripe Billing can't pull invoice payments from a connected account's balance, so each
 * invoice is settled with an Account Debit and then marked paid out of band. A test clock
 * simulates the second monthly cycle. Only runs against a test-mode key; reads the
 * connected account id from profiles and writes nothing to the database.
 */
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

if (!/_test_/.test(process.env.STRIPE_SECRET_KEY ?? "")) {
  console.error("Refusing to run: STRIPE_SECRET_KEY is not a test-mode key.");
  process.exit(1);
}

const PRODUCT_NAME = "Blue theme";
const EMAIL = process.argv[2] ?? "lovingfamily2600@gmail.com";
const DAY = 24 * 60 * 60;

async function main() {
  const { stripe } = await import("@/lib/stripe/server");
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { debitConnectedAccount } = await import("@/lib/stripe/debitConnectedAccount");

  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((p) => p.name === PRODUCT_NAME);
  if (!product || typeof product.default_price !== "string") {
    throw new Error(`Sandbox product "${PRODUCT_NAME}" with a default price not found.`);
  }
  const price = await stripe.prices.retrieve(product.default_price);
  if (!price.recurring || price.unit_amount == null) throw new Error("Blue theme price is not recurring.");
  const priceCents = price.unit_amount;
  console.log(`Product: ${product.name} (${product.id}) | price ${price.id}: $${priceCents / 100}/${price.recurring.interval}`);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, stripe_account_id")
    .ilike("email", EMAIL)
    .maybeSingle();
  const accountId = profile?.stripe_account_id as string | undefined;
  if (!accountId) throw new Error(`No connected account for ${EMAIL}.`);
  const account = await stripe.accounts.retrieve(accountId);
  if (account.controller?.requirement_collection !== "application") {
    throw new Error(`${accountId} is a legacy account; Account Debits need a platform-collected account.`);
  }
  console.log(`Connected account: ${accountId} (${EMAIL})`);

  const available = async () =>
    (await stripe.balance.retrieve({ stripeAccount: accountId })).available
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + b.amount, 0);

  // Two cycles: the first invoice now, the second after the test clock advances a month.
  const shortfall = priceCents * 2 - (await available());
  if (shortfall > 0) {
    await stripe.charges.create({ amount: shortfall * 2, currency: "usd", source: "tok_bypassPending", description: "sandbox platform funding" });
    await stripe.transfers.create({ amount: shortfall, currency: "usd", destination: accountId, description: "sandbox: funds for Blue theme subscription demo" });
  }
  const startBalance = await available();
  console.log(`Connected account available balance: $${startBalance / 100}`);

  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: "Blue theme balance subscription demo",
  });
  const customer = await stripe.customers.create({
    name: `Connected account ${accountId}`,
    email: EMAIL, // required for send_invoice; the sandbox never sends real emails
    metadata: { connected_account: accountId, user_id: profile!.user_id },
    test_clock: clock.id,
  });
  // send_invoice: no card on file; the platform settles each invoice from the account balance.
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    collection_method: "send_invoice",
    days_until_due: 7,
    metadata: { type: "connected_account_balance_subscription", connected_account: accountId },
  });
  console.log(`Subscription ${subscription.id} (${subscription.status}) on customer ${customer.id}, test clock ${clock.id}`);

  async function settleOpenInvoices(label: string) {
    const invoices = await stripe.invoices.list({ customer: customer.id, limit: 10 });
    for (const listed of invoices.data.filter((i) => i.status === "draft" || i.status === "open")) {
      const invoice = listed.status === "draft" ? await stripe.invoices.finalizeInvoice(listed.id) : listed;
      const debit = await debitConnectedAccount(
        accountId!,
        invoice.amount_due / 100,
        `${PRODUCT_NAME} subscription (invoice ${invoice.number})`,
        "account_debit",
        { idempotencyKey: `invoice-${invoice.id}`, metadata: { invoice_id: invoice.id } },
      );
      await stripe.invoices.update(invoice.id, { metadata: { account_debit_id: debit.debitId ?? "" } });
      const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });
      console.log(`${label}: invoice ${paid.number} $${paid.total / 100} -> ${paid.status} (out of band) via account debit ${debit.debitId}`);
    }
  }

  await settleOpenInvoices("cycle 1");
  console.log(`After cycle 1, account balance: $${(await available()) / 100}`);

  const renewalAt = subscription.items.data[0].current_period_end + 2 * 3600;
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: renewalAt });
  for (let i = 0; i < 30; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (c.status === "ready") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await settleOpenInvoices("cycle 2");

  const finalBalance = await available();
  const final = await stripe.subscriptions.retrieve(subscription.id);
  const allInvoices = await stripe.invoices.list({ customer: customer.id, limit: 10 });
  console.log(`\nSubscription status: ${final.status}`);
  console.log(`Invoices: ${allInvoices.data.map((i) => `${i.number}:${i.status}:$${i.total / 100}`).join(", ")}`);
  console.log(`Account balance: $${startBalance / 100} -> $${finalBalance / 100} (expected $${(startBalance - priceCents * 2) / 100})`);
  const ok =
    final.status === "active" &&
    allInvoices.data.filter((i) => i.status === "paid").length === 2 &&
    finalBalance === startBalance - priceCents * 2;
  console.log(ok ? "RESULT: PASS" : "RESULT: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
