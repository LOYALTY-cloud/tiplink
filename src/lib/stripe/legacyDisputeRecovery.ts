import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerEntry } from "@/lib/ledger";
import type { sendEmail as SendEmailFn } from "@/lib/emailService";
import type { createNotification as CreateNotificationFn } from "@/lib/notifications";
import { emailFooter } from "@/lib/email/footer";

const DEFAULT_DISPUTE_FEE_CENTS = 1500;

export interface LegacyRecoveryDeps {
  stripe: Stripe;
  supabase: SupabaseClient;
  ledgerFn: (entry: LedgerEntry) => Promise<unknown>;
  sendEmail: typeof SendEmailFn;
  createNotification: typeof CreateNotificationFn;
  platformAccountId?: string;
}

interface TipRef {
  receipt_id: string;
  creator_user_id: string;
}

export type LegacyRecoveryResult =
  | { status: "skipped"; reason: string }
  | { status: "recovered"; principalCents: number; feeCents: number; reversalId: string | null; feeTransferId: string };

const dollars = (cents: number) => (cents / 100).toFixed(2);

function idOf(ref: string | { id: string } | null | undefined): string | null {
  return typeof ref === "string" ? ref : ref?.id ?? null;
}

async function loadDestinationCharge(stripe: Stripe, dispute: Stripe.Dispute) {
  const charge = typeof dispute.charge === "string" ? await stripe.charges.retrieve(dispute.charge) : dispute.charge;
  const transferId = idOf(charge.transfer as string | Stripe.Transfer | null);
  const destination = idOf(charge.transfer_data?.destination as string | Stripe.Account | null | undefined);
  return { charge, transferId, destination };
}

async function findFeeRecovery(supabase: SupabaseClient, userId: string, disputeId: string) {
  const { data } = await supabase
    .from("transactions_ledger")
    .select("id, meta")
    .eq("user_id", userId)
    .eq("type", "fee")
    .contains("meta", { action: "dispute_fee_recovery", dispute_id: disputeId })
    .maybeSingle();
  return data as { id: string; meta: Record<string, unknown> | null } | null;
}

function buildEmail(name: string, disputeId: string, receiptId: string, principalCents: number, feeCents: number) {
  return `
    <div style="max-width:600px;margin:0 auto;padding:28px;background:#0b0b0b;color:#f3f4f6;font-family:Arial,sans-serif;border-radius:12px;">
      <h1 style="font-size:22px;margin:0 0 16px;">Payment dispute charged to your account</h1>
      <p>Hello ${name},</p>
      <p>A payment you received was disputed by the customer's bank.</p>
      <div style="padding:16px;background:#171717;border:1px solid #333;border-radius:8px;line-height:1.8;">
        <div>Disputed payment: <strong>$${dollars(principalCents)}</strong></div>
        <div>Stripe dispute fee: <strong>$${dollars(feeCents)}</strong></div>
        <div>Total charged for this dispute: <strong>$${dollars(principalCents + feeCents)}</strong></div>
        <div>Receipt: <strong>${receiptId}</strong></div>
        <div>Dispute: <strong>${disputeId}</strong></div>
      </div>
      <p>The disputed payment and fee were recovered from your connected Stripe account and returned to the 1neLink platform. If the dispute is decided in our favor, the disputed payment will be returned to you.</p>
      <p>If you believe this dispute is incorrect, contact support@1nelink.com.</p>
      ${emailFooter()}
    </div>`;
}

/**
 * Tips paid before the direct-charge migration are destination charges, so Stripe debits the
 * platform for the dispute and fee. Claws the principal and fee back from the creator's
 * connected account. Idempotent per dispute via Stripe idempotency keys and a ledger marker.
 */
export async function recoverLegacyDestinationDispute(
  deps: LegacyRecoveryDeps,
  input: { dispute: Stripe.Dispute; eventAccount: string | null; eventId: string; tip: TipRef }
): Promise<LegacyRecoveryResult> {
  const { stripe, supabase, ledgerFn } = deps;
  const { eventAccount, eventId, tip } = input;

  // Disputes raised on a connected account are already borne by the creator.
  if (eventAccount) return { status: "skipped", reason: "connected_account_dispute" };

  const dispute = Array.isArray(input.dispute.balance_transactions)
    ? input.dispute
    : await stripe.disputes.retrieve(input.dispute.id);

  const withdrawnCents = (dispute.balance_transactions ?? []).reduce((sum, bt) => sum + (bt.amount < 0 ? -bt.amount : 0), 0);
  if (withdrawnCents <= 0) return { status: "skipped", reason: "no_funds_withdrawn" };

  const { transferId, destination } = await loadDestinationCharge(stripe, dispute);
  if (!transferId || !destination) return { status: "skipped", reason: "not_destination_charge" };

  if (await findFeeRecovery(supabase, tip.creator_user_id, dispute.id)) {
    return { status: "skipped", reason: "already_recovered" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, handle, email, stripe_account_id")
    .eq("user_id", tip.creator_user_id)
    .single();
  if (profileError || !profile) throw new Error(`creator profile not found for dispute ${dispute.id}`);
  if (profile.stripe_account_id !== destination) {
    throw new Error(`dispute ${dispute.id}: charge destination ${destination} does not match creator account`);
  }

  const transfer = await stripe.transfers.retrieve(transferId);
  const principalCents = Math.min(dispute.amount, transfer.amount);
  const reversibleCents = principalCents - transfer.amount_reversed;
  const feeCents =
    (dispute.balance_transactions ?? []).reduce((sum, bt) => sum + (bt.fee ?? 0), 0) || DEFAULT_DISPUTE_FEE_CENTS;
  const platformAccountId = deps.platformAccountId ?? (await stripe.accounts.retrieve()).id;

  let reversalId: string | null = null;
  if (reversibleCents > 0) {
    const reversal = await stripe.transfers.createReversal(
      transferId,
      {
        amount: reversibleCents,
        description: `Dispute recovery: ${dispute.id}`,
        metadata: { dispute_id: dispute.id, receipt_id: tip.receipt_id },
      },
      { idempotencyKey: `recover-principal-${dispute.id}` }
    );
    reversalId = reversal.id;
  }

  const feeTransfer = await stripe.transfers.create(
    {
      amount: feeCents,
      currency: "usd",
      destination: platformAccountId,
      description: `Dispute fee recovery: ${dispute.id}`,
      metadata: { dispute_id: dispute.id, receipt_id: tip.receipt_id, recovery_type: "dispute_fee" },
    },
    { stripeAccount: destination, idempotencyKey: `recover-dispute-fee-${dispute.id}` }
  );

  // Principal was already debited from the ledger by the dispute.created handler.
  await ledgerFn({
    user_id: tip.creator_user_id,
    type: "fee",
    amount: -(feeCents / 100),
    reference_id: tip.receipt_id,
    meta: {
      action: "dispute_fee_recovery",
      dispute_id: dispute.id,
      receipt_id: tip.receipt_id,
      stripe_dispute_fee: feeCents / 100,
      principal_already_debited: principalCents / 100,
      transfer_reversal_id: reversalId,
      fee_transfer_id: feeTransfer.id,
      connected_account_id: destination,
      event_id: eventId,
      source: "webhook_auto_recovery",
    },
  });

  await supabase.from("admin_actions").insert({
    admin_id: null,
    action: "dispute_platform_recovery",
    target_user: tip.creator_user_id,
    severity: "critical",
    metadata: {
      dispute_id: dispute.id,
      receipt_id: tip.receipt_id,
      disputed_amount: principalCents / 100,
      dispute_fee: feeCents / 100,
      total_recovered: (principalCents + feeCents) / 100,
      transfer_reversal_id: reversalId,
      fee_transfer_id: feeTransfer.id,
      source: "webhook_auto_recovery",
    },
  });

  const title = `Payment dispute charge - receipt ${tip.receipt_id.slice(0, 8)}`;
  const body = `A $${dollars(principalCents)} payment was disputed. Stripe charged a $${dollars(feeCents)} dispute fee. A total of $${dollars(principalCents + feeCents)} was charged to your account for this dispute.`;

  await deps.createNotification({
    userId: tip.creator_user_id,
    type: "dispute",
    category: "security",
    entityId: tip.receipt_id,
    title,
    body,
    skipEmail: true,
  });

  if (profile.email) {
    await deps.sendEmail({
      type: "NOTIFICATION",
      to: profile.email,
      subject: title,
      html: buildEmail(profile.display_name ?? profile.handle ?? "Creator", dispute.id, tip.receipt_id, principalCents, feeCents),
      categoryOverride: "security",
    });
  }

  return { status: "recovered", principalCents, feeCents, reversalId, feeTransferId: feeTransfer.id };
}

/**
 * When a recovered dispute is won, Stripe credits the platform again, so the principal clawed
 * back earlier goes back to the creator. The dispute fee is left for manual review.
 */
export async function reimburseRecoveredDisputeWin(
  deps: LegacyRecoveryDeps,
  input: { dispute: Stripe.Dispute; tip: TipRef }
): Promise<{ status: "skipped"; reason: string } | { status: "reimbursed"; principalCents: number; transferId: string }> {
  const { stripe, supabase } = deps;
  const { dispute, tip } = input;

  const recovery = await findFeeRecovery(supabase, tip.creator_user_id, dispute.id);
  if (!recovery) return { status: "skipped", reason: "not_recovered" };

  const principalCents = Math.round(Number(recovery.meta?.principal_already_debited ?? 0) * 100);
  if (principalCents <= 0) return { status: "skipped", reason: "no_principal_recorded" };

  const { destination } = await loadDestinationCharge(stripe, dispute);
  if (!destination) return { status: "skipped", reason: "not_destination_charge" };

  const transfer = await stripe.transfers.create(
    {
      amount: principalCents,
      currency: "usd",
      destination,
      description: `Dispute won, principal returned: ${dispute.id}`,
      metadata: { dispute_id: dispute.id, receipt_id: tip.receipt_id, recovery_type: "dispute_won_reimbursement" },
    },
    { idempotencyKey: `reimburse-dispute-won-${dispute.id}` }
  );

  await supabase.from("admin_actions").insert({
    admin_id: null,
    action: "dispute_won_reimbursement",
    target_user: tip.creator_user_id,
    severity: "warning",
    metadata: {
      dispute_id: dispute.id,
      receipt_id: tip.receipt_id,
      reimbursed_amount: principalCents / 100,
      transfer_id: transfer.id,
      dispute_fee_retained: Number(recovery.meta?.stripe_dispute_fee ?? 0),
    },
  });

  await deps.createNotification({
    userId: tip.creator_user_id,
    type: "dispute",
    category: "security",
    entityId: tip.receipt_id,
    title: `Dispute won - receipt ${tip.receipt_id.slice(0, 8)}`,
    body: `The dispute was decided in your favor. $${dollars(principalCents)} was returned to your connected Stripe account.`,
    skipEmail: true,
  });

  return { status: "reimbursed", principalCents, transferId: transfer.id };
}
