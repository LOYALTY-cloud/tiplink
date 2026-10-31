import Stripe from "stripe";
import { addLedgerEntry } from "../../src/lib/ledger";
import { emailFooter } from "../../src/lib/email/footer";
import { sendEmail } from "../../src/lib/emailService";
import { supabaseAdmin } from "../../src/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });

const EXECUTE = process.env.EXECUTE_DISPUTE_RECOVERY === "1";
const CREATOR_USER_ID = "43a26203-a16b-447b-98ca-6a4135a41ac8";
const CONNECTED_ACCOUNT_ID = "acct_1UAre8RQMSx81Izn";
const PLATFORM_ACCOUNT_ID = "acct_1T9uGgEukZyx2zfV";
const DISPUTE_FEE_CENTS = 1500;

const DISPUTES = [
  { disputeId: "du_1UKWX0EukZyx2zfV0M8JNUx0", transferId: "tr_3UBZzQEukZyx2zfV1ToRTaNj", receiptId: "8aacf964-5493-492b-831b-a146d8af570a", amountCents: 1061 },
  { disputeId: "du_1UKW7sEukZyx2zfVtK4v5vBX", transferId: "tr_3UBa0lEukZyx2zfV0aWZkrhO", receiptId: "b505e439-93ba-44fb-9060-422c0b148af2", amountCents: 1061 },
  { disputeId: "du_1UKVRGEukZyx2zfVxMF4DYJW", transferId: "tr_3UBZynEukZyx2zfV0JNDgL1o", receiptId: "040d2744-ad0c-4da2-ade0-97fdaaa05a63", amountCents: 1061 },
  { disputeId: "du_1UKV1rEukZyx2zfV7nJk86tO", transferId: "tr_3UBa0LEukZyx2zfV0Vh0ABz0", receiptId: "9830ea98-3404-412f-9283-51eeabff033e", amountCents: 1061 },
  { disputeId: "du_1UKUrxEukZyx2zfVuv9dRxnN", transferId: "tr_3UBZzuEukZyx2zfV1YsEkvor", receiptId: "23459b97-e625-458a-9af6-e909619f799d", amountCents: 1061 },
] as const;

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

async function ensureInAppNotification(receiptId: string, disputedCents: number) {
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", CREATOR_USER_ID)
    .eq("type", "dispute")
    .eq("entity_id", receiptId)
    .maybeSingle();
  if (existing) return false;

  const { title, body } = notificationContent(receiptId, disputedCents);
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: CREATOR_USER_ID,
    type: "dispute",
    category: "security",
    entity_id: receiptId,
    title,
    body,
  });
  if (error) throw new Error(`${receiptId}: notification failed: ${error.message}`);
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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("display_name, handle, email")
    .eq("user_id", CREATOR_USER_ID)
    .eq("stripe_account_id", CONNECTED_ACCOUNT_ID)
    .single();
  if (profileError || !profile?.email) throw new Error("Creator profile or email not found");

  console.log(`${EXECUTE ? "EXECUTE" : "DRY RUN"}: ${DISPUTES.length} disputes for ${profile.display_name ?? profile.handle}`);

  for (const item of DISPUTES) {
    const dispute = await stripe.disputes.retrieve(item.disputeId, { expand: ["charge"] });
    const transfer = await stripe.transfers.retrieve(item.transferId);
    const charge = typeof dispute.charge === "string" ? await stripe.charges.retrieve(dispute.charge) : dispute.charge;
    const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;

    if (dispute.amount !== item.amountCents || transfer.amount !== item.amountCents) {
      throw new Error(`${item.disputeId}: amount mismatch`);
    }
    if (destination !== CONNECTED_ACCOUNT_ID || charge.metadata?.receipt_id !== item.receiptId) {
      throw new Error(`${item.disputeId}: account or receipt mismatch`);
    }

    const { data: existingFee } = await supabaseAdmin
      .from("transactions_ledger")
      .select("id")
      .eq("user_id", CREATOR_USER_ID)
      .eq("type", "fee")
      .contains("meta", { action: "dispute_fee_recovery", dispute_id: item.disputeId })
      .maybeSingle();

    if (existingFee) {
      const inserted = EXECUTE
        ? await ensureInAppNotification(item.receiptId, item.amountCents)
        : false;
      console.log(`SKIP ${item.disputeId}: recovery already recorded${inserted ? ", notification backfilled" : ""}`);
      continue;
    }

    console.log(`PLAN ${item.disputeId}: reverse $${dollars(item.amountCents)}, recover $15.00 fee, charge $${dollars(item.amountCents + DISPUTE_FEE_CENTS)}`);
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
      stripeAccount: CONNECTED_ACCOUNT_ID,
      idempotencyKey: `recover-dispute-fee-${item.disputeId}`,
    });

    await addLedgerEntry({
      user_id: CREATOR_USER_ID,
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
      target_user: CREATOR_USER_ID,
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

    await ensureInAppNotification(item.receiptId, item.amountCents);

    console.log(`DONE ${item.disputeId}: reversal=${reversalId}, fee_transfer=${feeTransfer.id}, email=sent, notification=inserted`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});