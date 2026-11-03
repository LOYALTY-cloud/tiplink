import Stripe from "stripe";
import { addLedgerEntry } from "../../src/lib/ledger";
import { emailFooter } from "../../src/lib/email/footer";
import { sendEmail } from "../../src/lib/emailService";
import { supabaseAdmin } from "../../src/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });

const EXECUTE = process.env.EXECUTE_DISPUTE_RECOVERY === "1";
const PLATFORM_ACCOUNT_ID = "acct_1T9uGgEukZyx2zfV";
const DISPUTE_FEE_CENTS = 1500;

const DISPUTES = [
  { disputeId: "du_1UTDGNEukZyx2zfVNd1OA9XR", transferId: "tr_3UBbNPEukZyx2zfV0QHeu0gq", receiptId: "4dbd199a-ab0d-4e76-a73b-f3089422a71b", creatorUserId: "43a26203-a16b-447b-98ca-6a4135a41ac8", accountId: "acct_1UAre8RQMSx81Izn", amountCents: 2091 },
  { disputeId: "du_1USswTEukZyx2zfVXj8zWxlW", transferId: "tr_3UCGEMEukZyx2zfV0NWkJmhF", receiptId: "c666e6b6-6f92-4bc8-8949-bfbf73815fba", creatorUserId: "7e2894d4-6dcf-4a58-9141-4a71d654fec9", accountId: "acct_1UBa60RKwkkFdauu", amountCents: 2091 },
  { disputeId: "du_1USsHSEukZyx2zfVukx07duM", transferId: "tr_3UCGBSEukZyx2zfV1W1cpORa", receiptId: "efa4212b-a864-4ea1-9d0a-fb454bc287c3", creatorUserId: "7e2894d4-6dcf-4a58-9141-4a71d654fec9", accountId: "acct_1UBa60RKwkkFdauu", amountCents: 1061 },
  { disputeId: "du_1USruGEukZyx2zfVDNnXLeJ0", transferId: "tr_3UCGE1EukZyx2zfV1wizf4Oa", receiptId: "846a4865-7713-4b30-917e-6b78edd37cd4", creatorUserId: "7e2894d4-6dcf-4a58-9141-4a71d654fec9", accountId: "acct_1UBa60RKwkkFdauu", amountCents: 2091 },
  { disputeId: "du_1USrbWEukZyx2zfV11eSP13O", transferId: "tr_3UCGCtEukZyx2zfV0J8ww0jn", receiptId: "6748e17d-21b0-4163-90ec-b3db8366c5ad", creatorUserId: "7e2894d4-6dcf-4a58-9141-4a71d654fec9", accountId: "acct_1UBa60RKwkkFdauu", amountCents: 2091 },
  { disputeId: "du_1USrbIEukZyx2zfVquJSSkhW", transferId: "tr_3UCGCVEukZyx2zfV1fq0wb7L", receiptId: "5fe28c85-7c1a-448b-8e53-d2f693404536", creatorUserId: "7e2894d4-6dcf-4a58-9141-4a71d654fec9", accountId: "acct_1UBa60RKwkkFdauu", amountCents: 2091 },
  { disputeId: "du_1URdNhEukZyx2zfVNduq7U27", transferId: "tr_3UFrZ5EukZyx2zfV19RnxSab", receiptId: "864c8a59-edd5-4339-a1ba-bee4adb21be3", creatorUserId: "5d623192-018b-4ebc-8229-e7571f9aeaff", accountId: "acct_1UFThlI7uOwZ4xXG", amountCents: 2091 },
  { disputeId: "du_1URXxaEukZyx2zfVQieqfULH", transferId: "tr_3UFW6xEukZyx2zfV04ya23eg", receiptId: "07c00d0f-a273-4cbc-b690-2bf20eb4304a", creatorUserId: "8da46fbc-95dc-4c65-bb0e-577bd07e557f", accountId: "acct_1UBaUgEWwVHB2xNZ", amountCents: 2091 },
  { disputeId: "du_1UPEFuEukZyx2zfVvhZVMuRw", transferId: "tr_3UBbNnEukZyx2zfV0JlzPDG5", receiptId: "cb1662f3-68ef-4dea-a28b-0c0532ebc8fb", creatorUserId: "4eec3a26-9600-4d29-9fd9-75b99ce79c11", accountId: "acct_1UBaIHEcsYui0Qz4", amountCents: 1061 },
  { disputeId: "du_1UPDt9EukZyx2zfVSnl8QSRB", transferId: "tr_3UBbNBEukZyx2zfV0xQ1VYqJ", receiptId: "34435431-4780-4386-9367-d64d8f15c8b7", creatorUserId: "4eec3a26-9600-4d29-9fd9-75b99ce79c11", accountId: "acct_1UBaIHEcsYui0Qz4", amountCents: 1061 },
  { disputeId: "du_1UPDQlEukZyx2zfVKWKKm8Dc", transferId: "tr_3UBbLyEukZyx2zfV0V7iYPLh", receiptId: "c49faa5d-337d-4f49-85ad-e66f8beef147", creatorUserId: "4eec3a26-9600-4d29-9fd9-75b99ce79c11", accountId: "acct_1UBaIHEcsYui0Qz4", amountCents: 1061 },
  { disputeId: "du_1UPCr1EukZyx2zfVzBaZadAa", transferId: "tr_3UBbOIEukZyx2zfV0BYUmL1r", receiptId: "ec3c4807-552e-4519-a4c4-69b77c5573ac", creatorUserId: "4eec3a26-9600-4d29-9fd9-75b99ce79c11", accountId: "acct_1UBaIHEcsYui0Qz4", amountCents: 1061 },
] as const;

type Item = (typeof DISPUTES)[number];

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function buildEmail(displayName: string, disputeId: string, receiptId: string, disputedCents: number) {
  const totalCents = disputedCents + DISPUTE_FEE_CENTS;
  return `
    <div style="max-width:600px;margin:0 auto;padding:28px;background:#0b0b0b;color:#f3f4f6;font-family:Arial,sans-serif;border-radius:12px;">
      <h1 style="font-size:22px;margin:0 0 16px;">Payment dispute charged to your account</h1>
      <p>Hello ${displayName},</p>
      <p>A payment you received was disputed by the customer's bank as fraudulent.</p>
      <div style="padding:16px;background:#171717;border:1px solid #333;border-radius:8px;line-height:1.8;">
        <div>Disputed payment: <strong>$${dollars(disputedCents)}</strong></div>
        <div>Stripe dispute fee: <strong>$${dollars(DISPUTE_FEE_CENTS)}</strong></div>
        <div>Total charged for this dispute: <strong>$${dollars(totalCents)}</strong></div>
        <div>Receipt: <strong>${receiptId}</strong></div>
        <div>Dispute: <strong>${disputeId}</strong></div>
      </div>
      <p>The disputed payment and fee were recovered from your connected Stripe account and returned to the 1neLink platform.</p>
      <p>If you believe this dispute is incorrect, contact support@1nelink.com.</p>
      ${emailFooter()}
    </div>`;
}

function notificationContent(receiptId: string, disputedCents: number) {
  return {
    title: `Payment dispute charge - receipt ${receiptId.slice(0, 8)}`,
    body: `A $${dollars(disputedCents)} payment was disputed as fraudulent. Stripe charged a $15.00 dispute fee. A total of $${dollars(disputedCents + DISPUTE_FEE_CENTS)} was charged to your account for this dispute.`,
  };
}

async function ensureInAppNotification(item: Item) {
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", item.creatorUserId)
    .eq("type", "dispute")
    .eq("entity_id", item.receiptId)
    .maybeSingle();
  if (existing) return false;

  const { title, body } = notificationContent(item.receiptId, item.amountCents);
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: item.creatorUserId,
    type: "dispute",
    category: "security",
    entity_id: item.receiptId,
    title,
    body,
  });
  if (error) throw new Error(`${item.receiptId}: notification failed: ${error.message}`);
  return true;
}

async function main() {
  if (!(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) {
    throw new Error("Refusing to run without the live Stripe key");
  }

  const platform = await stripe.accounts.retrieve();
  if (platform.id !== PLATFORM_ACCOUNT_ID || process.env.STRIPE_PLATFORM_ACCOUNT_ID !== PLATFORM_ACCOUNT_ID) {
    throw new Error("Configured Stripe platform account does not match the expected 1neLink account");
  }

  console.log(`${EXECUTE ? "EXECUTE" : "DRY RUN"}: ${DISPUTES.length} disputes`);

  // Validate every item against Stripe and the app before any money moves.
  const profiles = new Map<string, { display_name: string | null; handle: string | null; email: string }>();
  for (const item of DISPUTES) {
    if (!profiles.has(item.creatorUserId)) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("display_name, handle, email, stripe_account_id")
        .eq("user_id", item.creatorUserId)
        .single();
      if (error || !data?.email) throw new Error(`${item.creatorUserId}: creator profile or email not found`);
      if (data.stripe_account_id !== item.accountId) throw new Error(`${item.disputeId}: profile account mismatch`);
      profiles.set(item.creatorUserId, data);
    }

    const dispute = await stripe.disputes.retrieve(item.disputeId, { expand: ["charge"] });
    const transfer = await stripe.transfers.retrieve(item.transferId);
    const charge = typeof dispute.charge === "string" ? await stripe.charges.retrieve(dispute.charge) : dispute.charge;
    const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
    const chargeTransfer = typeof charge.transfer === "string" ? charge.transfer : charge.transfer?.id;

    if (dispute.amount !== item.amountCents || transfer.amount !== item.amountCents) {
      throw new Error(`${item.disputeId}: amount mismatch`);
    }
    if (destination !== item.accountId || chargeTransfer !== item.transferId || charge.metadata?.receipt_id !== item.receiptId) {
      throw new Error(`${item.disputeId}: account, transfer, or receipt mismatch`);
    }
    if (dispute.status === "won") throw new Error(`${item.disputeId}: dispute already won; do not recover`);
  }

  for (const item of DISPUTES) {
    const profile = profiles.get(item.creatorUserId)!;
    const transfer = await stripe.transfers.retrieve(item.transferId);

    const { data: existingFee } = await supabaseAdmin
      .from("transactions_ledger")
      .select("id")
      .eq("user_id", item.creatorUserId)
      .eq("type", "fee")
      .contains("meta", { action: "dispute_fee_recovery", dispute_id: item.disputeId })
      .maybeSingle();

    if (existingFee) {
      const inserted = EXECUTE ? await ensureInAppNotification(item) : false;
      console.log(`SKIP ${item.disputeId}: recovery already recorded${inserted ? ", notification backfilled" : ""}`);
      continue;
    }

    // The dispute.created webhook already debited the principal from the creator's ledger.
    const { data: principalDebits } = await supabaseAdmin
      .from("transactions_ledger")
      .select("id")
      .eq("user_id", item.creatorUserId)
      .eq("type", "tip_refunded")
      .contains("meta", { dispute_id: item.disputeId });
    console.log(`PLAN ${item.disputeId} (${profile.display_name ?? profile.handle}): reverse $${dollars(item.amountCents)}, recover $15.00 fee, total $${dollars(item.amountCents + DISPUTE_FEE_CENTS)}; principal ledger debit rows=${principalDebits?.length ?? 0}`);
    if (!EXECUTE) continue;

    let reversalId: string;
    if (transfer.amount_reversed >= item.amountCents) {
      const reversals = await stripe.transfers.listReversals(item.transferId, { limit: 100 });
      reversalId = reversals.data[0]?.id ?? "already_reversed";
    } else {
      const reversal = await stripe.transfers.createReversal(item.transferId, {
        amount: item.amountCents - transfer.amount_reversed,
        description: `Dispute recovery: ${item.disputeId}`,
        metadata: { dispute_id: item.disputeId, receipt_id: item.receiptId },
      }, { idempotencyKey: `recover-principal-${item.disputeId}` });
      reversalId = reversal.id;
    }

    const feeTransfer = await stripe.transfers.create({
      amount: DISPUTE_FEE_CENTS,
      currency: "usd",
      destination: PLATFORM_ACCOUNT_ID,
      description: `Dispute fee recovery: ${item.disputeId}`,
      metadata: { dispute_id: item.disputeId, receipt_id: item.receiptId, recovery_type: "dispute_fee" },
    }, {
      stripeAccount: item.accountId,
      idempotencyKey: `recover-dispute-fee-${item.disputeId}`,
    });

    await addLedgerEntry({
      user_id: item.creatorUserId,
      type: "fee",
      amount: -15,
      reference_id: item.receiptId,
      meta: {
        action: "dispute_fee_recovery",
        dispute_id: item.disputeId,
        receipt_id: item.receiptId,
        stripe_dispute_fee: 15,
        principal_already_debited: item.amountCents / 100,
        transfer_reversal_id: reversalId,
        fee_transfer_id: feeTransfer.id,
      },
    });

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: null,
      action: "dispute_platform_recovery",
      target_user: item.creatorUserId,
      severity: "critical",
      metadata: {
        dispute_id: item.disputeId,
        receipt_id: item.receiptId,
        disputed_amount: item.amountCents / 100,
        dispute_fee: 15,
        total_recovered: (item.amountCents + DISPUTE_FEE_CENTS) / 100,
        transfer_reversal_id: reversalId,
        fee_transfer_id: feeTransfer.id,
      },
    });

    const { title } = notificationContent(item.receiptId, item.amountCents);
    const emailResult = await sendEmail({
      type: "NOTIFICATION",
      to: profile.email,
      subject: title,
      html: buildEmail(profile.display_name ?? profile.handle ?? "Creator", item.disputeId, item.receiptId, item.amountCents),
      categoryOverride: "security",
    });
    if (!emailResult.success) throw new Error(`${item.disputeId}: email failed: ${emailResult.error}`);

    await ensureInAppNotification(item);

    console.log(`DONE ${item.disputeId}: reversal=${reversalId}, fee_transfer=${feeTransfer.id}, email=sent, notification=inserted`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
