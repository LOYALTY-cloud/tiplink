import fs from "fs";
import Stripe from "stripe";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const key = env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_test_")) throw new Error("Refusing to run: not a test key");
const stripe = new Stripe(key);
const step = (m: string) => console.log(`\n== ${m}`);
const usd = (n: number) => `$${(n / 100).toFixed(2)}`;

async function main() {
  const name = process.argv[2] || "Test Creator";
  const email = process.argv[3] || "lovingfamily2600@gmail.com";

  step("Cardholder");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const idDoc = await stripe.files.create({ purpose: "identity_document", file: { data: png, name: "id.png", type: "application/octet-stream" } });
  const cardholder = await stripe.issuing.cardholders.create({
    type: "individual",
    name,
    email,
    phone_number: "+18005550100",
    billing: { address: { line1: "123 Main Street", city: "San Francisco", state: "CA", postal_code: "94111", country: "US" } },
    individual: { first_name: name.split(" ")[0], last_name: name.split(" ").slice(1).join(" ") || "User", dob: { day: 1, month: 1, year: 1990 }, verification: { document: { front: idDoc.id } }, card_issuing: { user_terms_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" } } },
    status: "active",
  });
  console.log(cardholder.id);

  step("Virtual card");
  const card = await stripe.issuing.cards.create({
    cardholder: cardholder.id,
    currency: "usd",
    type: "virtual",
    status: "active",
    spending_controls: { spending_limits: [{ amount: 50000, interval: "monthly" }] },
  });
  console.log(card.id, `•••• ${card.last4}`, card.status);

  step("Purchase (authorize + capture $25.00)");
  const merchant: Stripe.TestHelpers.Issuing.AuthorizationCreateParams.MerchantData = { name: "Test Coffee Co", category: "eating_places_restaurants", city: "San Francisco", state: "CA", country: "US", postal_code: "94111" };
  // Cardholder identity verification finishes asynchronously, so early attempts are declined.
  let auth = await stripe.testHelpers.issuing.authorizations.create({ card: card.id, amount: 2500, merchant_data: merchant });
  for (let i = 0; i < 12 && !auth.approved; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    auth = await stripe.testHelpers.issuing.authorizations.create({ card: card.id, amount: 2500, merchant_data: merchant });
  }
  console.log("auth", auth.id, auth.approved ? "approved" : "declined", usd(auth.amount));
  if (!auth.approved) return;
  const captured = await stripe.testHelpers.issuing.authorizations.capture(auth.id);
  const txId = (captured.transactions?.[0] as Stripe.Issuing.Transaction | undefined)?.id
    ?? (await stripe.issuing.transactions.list({ card: card.id, limit: 1 })).data[0].id;
  console.log("transaction", txId);

  step("Second purchase, then refund it ($10.00)");
  const auth2 = await stripe.testHelpers.issuing.authorizations.create({
    card: card.id, amount: 1000,
    merchant_data: { name: "Test Bookstore", category: "book_stores", country: "US" },
  });
  const cap2 = await stripe.testHelpers.issuing.authorizations.capture(auth2.id);
  const tx2 = (await stripe.issuing.transactions.list({ card: card.id, limit: 5 })).data.find((t) => t.authorization === cap2.id)!;
  const refund = await stripe.testHelpers.issuing.transactions.refund(tx2.id, { refund_amount: 1000 });
  console.log("refund", refund.id, usd(refund.amount));

  step("Dispute the $25.00 transaction (chargeback)");
  try {
    const dispute = await stripe.issuing.disputes.create({
      transaction: txId,
      evidence: { reason: "fraudulent", fraudulent: { explanation: "I did not make this purchase." } },
    });
    console.log(dispute.id, dispute.status, usd(dispute.amount));
    await stripe.issuing.disputes.submit(dispute.id);
    console.log("submitted");
  } catch (e) {
    console.log("dispute:", (e as Error).message);
  }

  step("Summary");
  const txs = await stripe.issuing.transactions.list({ card: card.id, limit: 10 });
  for (const t of txs.data) console.log(t.id, t.type, usd(t.amount), t.merchant_data.name, t.dispute ?? "");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
