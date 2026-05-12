/**
 * syncAccount.ts
 *
 * Stripe is the source of truth.
 * This module provides a single `syncStripeAccount()` function that:
 *   1. Pulls the live account directly from Stripe
 *   2. Derives platform-level flags (verification, restriction, monetization)
 *   3. Writes a complete snapshot to `profiles`
 *   4. Upserts per-capability rows into `creator_capabilities`
 *   5. Inserts an `admin_alerts` row for high-risk accounts
 *
 * Call it from:
 *   - Webhook handlers (account.updated, capability.updated, person.updated, review.*)
 *   - The /api/stripe/connect/sync route
 *   - The /api/cron/stripe-reconcile background job
 */

import { getStripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluateStripeConnectPolicy } from "@/lib/stripe/connectRisk";
import { syncExternalAccounts } from "@/lib/syncExternalAccounts";
import { createNotification } from "@/lib/notifications";
import { sendAdminAlert } from "@/lib/adminAlerts";

// ──────────────────────────────────────────────────────────────────────────────

export type SyncResult =
  | { success: true; creatorId: string; verificationStatus: string; restrictionLevel: string }
  | { success: false; error: unknown };

// ──────────────────────────────────────────────────────────────────────────────

export async function syncStripeAccount(
  stripeAccountId: string,
  opts: { eventType?: string; notifyCreator?: boolean } = {}
): Promise<SyncResult> {
  const stripe = getStripe();

  try {
    // ── 1. Pull fresh account from Stripe ───────────────────────────────────
    const account = await stripe.accounts.retrieve(stripeAccountId);

    // ── 2. Find creator profile ─────────────────────────────────────────────
    const { data: creator, error: creatorError } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id")
      .eq("stripe_account_id", stripeAccountId)
      .maybeSingle();

    if (creatorError || !creator) {
      console.warn(`syncStripeAccount: no profile found for ${stripeAccountId}`);
      return { success: false, error: creatorError ?? new Error("creator not found") };
    }

    const creatorId = creator.id;
    const userId = creator.user_id;

    // ── 3. Requirement arrays ────────────────────────────────────────────────
    const requirements = account.requirements ?? {};
    const currentlyDue = requirements.currently_due ?? [];
    const eventuallyDue = requirements.eventually_due ?? [];
    const pastDue = requirements.past_due ?? [];
    const pendingVerification = requirements.pending_verification ?? [];
    const disabledReason = requirements.disabled_reason ?? null;

    // ── 4. Capabilities ──────────────────────────────────────────────────────
    const capabilities = (account.capabilities ?? {}) as Record<string, string>;
    const cardPayments = capabilities.card_payments ?? "inactive";
    const transfers = capabilities.transfers ?? "inactive";

    // ── 5. Core flags ────────────────────────────────────────────────────────
    const chargesEnabled = account.charges_enabled ?? false;
    const payoutsEnabled = account.payouts_enabled ?? false;
    const detailsSubmitted = account.details_submitted ?? false;
    const onboardingComplete = chargesEnabled && payoutsEnabled;

    // ── 6. Use existing connectRisk policy for restriction_state + verification
    const connectPolicy = evaluateStripeConnectPolicy(account);

    // ── 7. Derive platform-level states ─────────────────────────────────────
    let verificationStatus: string = "pending";
    let restrictionLevel: string = "healthy";
    let monetizationEnabled = false;
    let payoutsAllowed = false;
    let instantPayoutsAllowed = false;

    // Fully verified & clean
    if (chargesEnabled && payoutsEnabled && pastDue.length === 0 && !disabledReason) {
      verificationStatus = "verified";
      monetizationEnabled = true;
      payoutsAllowed = true;
      instantPayoutsAllowed = true;
    }

    // Requirements pending / warning
    if (currentlyDue.length > 0 || pendingVerification.length > 0) {
      verificationStatus = "verification_pending";
      instantPayoutsAllowed = false;
      restrictionLevel = "warning";
    }

    // Payouts disabled
    if (!payoutsEnabled) {
      payoutsAllowed = false;
      instantPayoutsAllowed = false;
      restrictionLevel = "restricted";
    }

    // High risk / disabled
    if (!chargesEnabled || pastDue.length > 0 || disabledReason) {
      monetizationEnabled = false;
      payoutsAllowed = false;
      instantPayoutsAllowed = false;
      verificationStatus = "restricted";
      restrictionLevel = "high_risk";
    }

    // Capability-level overrides
    if (cardPayments !== "active") monetizationEnabled = false;
    if (transfers !== "active") { payoutsAllowed = false; instantPayoutsAllowed = false; }

    // ── 8. Write full snapshot to profiles ──────────────────────────────────
    await supabaseAdmin
      .from("profiles")
      .update({
        // Core Stripe fields
        stripe_account_id:          account.id,
        stripe_account_type:        account.type ?? null,
        stripe_country:             account.country ?? null,
        stripe_business_type:       account.business_type ?? null,
        stripe_details_submitted:   detailsSubmitted,
        stripe_charges_enabled:     chargesEnabled,
        stripe_payouts_enabled:     payoutsEnabled,
        stripe_onboarding_complete: onboardingComplete,
        payouts_enabled:            onboardingComplete,
        payouts_enabled_at:         onboardingComplete ? new Date().toISOString() : null,

        // Requirements
        stripe_currently_due:        currentlyDue,
        stripe_eventually_due:       eventuallyDue,
        stripe_past_due:             pastDue,
        stripe_pending_verification: pendingVerification,
        stripe_disabled_reason:      disabledReason,
        stripe_requirements_due_count:         currentlyDue.length,
        stripe_future_requirements_due_count:  eventuallyDue.length,
        stripe_past_requirements_due_count:    pastDue.length,

        // Capabilities
        stripe_capabilities:           capabilities,
        stripe_card_payments_status:   cardPayments,
        stripe_transfers_status:       transfers,

        // Connect policy (existing fields — keep in sync)
        stripe_restriction_state:       connectPolicy.state,
        stripe_verification_status:     connectPolicy.verificationStatus,
        stripe_connect_risk_reasons:    connectPolicy.reasons,
        stripe_connect_last_event_at:   new Date().toISOString(),
        stripe_connect_last_event_type: opts.eventType ?? "sync",

        // Platform-level derived flags (new)
        restriction_level:       restrictionLevel,
        monetization_enabled:    monetizationEnabled,
        payouts_allowed:         payoutsAllowed,
        instant_payouts_allowed: instantPayoutsAllowed,

        // Full snapshot for debugging / auditing
        stripe_raw_account:    account as unknown as Record<string, unknown>,
        stripe_last_synced_at: new Date().toISOString(),
      })
      .eq("id", creatorId);

    // ── 9. Upsert per-capability rows ────────────────────────────────────────
    for (const [capName, capStatus] of Object.entries(capabilities)) {
      await supabaseAdmin
        .from("creator_capabilities")
        .upsert(
          { creator_id: creatorId, capability_name: capName, status: capStatus, updated_at: new Date().toISOString() },
          { onConflict: "creator_id,capability_name" }
        );
    }

    // ── 10. External accounts sync ───────────────────────────────────────────
    if (onboardingComplete) {
      try {
        await syncExternalAccounts(userId, stripeAccountId);
      } catch (e) {
        console.warn("syncStripeAccount: external accounts sync failed:", e instanceof Error ? e.message : e);
      }
    }

    // ── 11. Admin alerts for high-risk ───────────────────────────────────────
    if (restrictionLevel === "high_risk") {
      // Persist to admin_alerts table
      await supabaseAdmin.from("admin_alerts").insert({
        type:              "stripe_account_restricted",
        creator_id:        creatorId,
        stripe_account_id: stripeAccountId,
        reason:            disabledReason ?? "Stripe high-risk flag detected",
        metadata:          { currently_due: currentlyDue, past_due: pastDue, pending_verification: pendingVerification },
        created_at:        new Date().toISOString(),
      }).then(() => {}).catch(() => {});

      // Also send live admin notification
      sendAdminAlert({
        subject:  `Stripe account restricted: ${stripeAccountId}`,
        body:     `Creator account ${stripeAccountId} has been flagged as high_risk.\nDisabled reason: ${disabledReason ?? "none"}\nPast due: ${pastDue.join(", ") || "none"}`,
        severity: "critical",
        meta:     { stripe_account_id: stripeAccountId, creator_id: creatorId, disabled_reason: disabledReason ?? "none" },
      });
    }

    // ── 12. Notify creator if requirements changed and notifyCreator=true ────
    if (opts.notifyCreator && currentlyDue.length > 0 && userId) {
      await createNotification({
        userId,
        type:     "verification_needed",
        title:    "Action required on your account",
        body:     "Your Stripe account has pending requirements. Please complete them to keep receiving tips and payouts.",
        category: "security",
      }).catch(() => {});
    }

    console.log(
      `syncStripeAccount: ${stripeAccountId} → restriction=${restrictionLevel} verification=${verificationStatus} charges=${chargesEnabled} payouts=${payoutsEnabled}`
    );

    return { success: true, creatorId, verificationStatus, restrictionLevel };

  } catch (error) {
    console.error("syncStripeAccount failed:", stripeAccountId, error instanceof Error ? error.message : error);
    return { success: false, error };
  }
}
