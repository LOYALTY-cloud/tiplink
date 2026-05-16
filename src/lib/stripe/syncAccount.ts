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
    const requirements = (account.requirements as unknown as Record<string, unknown>) ?? {};
    const currentlyDue = (requirements.currently_due as string[]) ?? [];
    const eventuallyDue = (requirements.eventually_due as string[]) ?? [];
    const pastDue = (requirements.past_due as string[]) ?? [];
    const pendingVerification = (requirements.pending_verification as string[]) ?? [];
    const disabledReason = (requirements.disabled_reason as string | null) ?? null;

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
      // Deduplicate: skip if we already sent an alert for this account in the last 24 hours
      const cooldownCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentAlert } = await supabaseAdmin
        .from("admin_alerts")
        .select("id")
        .eq("type", "stripe_account_restricted")
        .eq("stripe_account_id", stripeAccountId)
        .gte("created_at", cooldownCutoff)
        .limit(1)
        .maybeSingle();

      if (recentAlert) {
        // Already alerted within 24 h — skip email and DB insert to prevent spam
        console.log(`syncStripeAccount: suppressing duplicate alert for ${stripeAccountId} (within 24 h cooldown)`);
      } else {

      // ── Human-readable translations for Stripe field codes ──────────────
      const stripeFieldLabels: Record<string, string> = {
        "individual.id_number":            "Government ID number (SSN / National ID)",
        "individual.ssn_last_4":           "Last 4 digits of SSN",
        "individual.dob.day":              "Date of birth",
        "individual.dob.month":            "Date of birth",
        "individual.dob.year":             "Date of birth",
        "individual.first_name":           "First name",
        "individual.last_name":            "Last name",
        "individual.address.line1":        "Street address",
        "individual.address.city":         "City",
        "individual.address.state":        "State",
        "individual.address.postal_code":  "ZIP / Postal code",
        "individual.phone":                "Phone number",
        "individual.email":                "Email address",
        "individual.verification.document":"Identity verification document",
        "tos_acceptance.date":             "Terms of Service not accepted (date missing)",
        "tos_acceptance.ip":               "Terms of Service not accepted (IP missing)",
        "business_profile.url":            "Business website URL",
        "business_profile.mcc":            "Business category",
        "external_account":                "Bank account / debit card not linked",
        "bank_account":                    "Bank account not linked",
      };

      const translateField = (f: string) => stripeFieldLabels[f] ?? f;
      const translateReason = (r: string | null) => {
        const map: Record<string, string> = {
          "requirements.past_due":       "Account has overdue requirements",
          "requirements.pending_verification": "Verification is pending review",
          "listed":                      "Account flagged on a watchlist",
          "under_review":                "Account is under Stripe review",
          "other":                       "Other restriction",
          "rejected.fraud":              "Account rejected for fraud",
          "rejected.terms_of_service":   "Account rejected for Terms of Service violation",
          "rejected.listed":             "Account rejected — listed entity",
          "rejected.other":              "Account rejected",
        };
        return r ? (map[r] ?? r) : "Unknown";
      };

      const pastDueReadable      = pastDue.map(translateField);
      const currentlyDueReadable = currentlyDue.map(translateField);
      const pendingReadable      = pendingVerification.map(translateField);
      const reasonReadable       = translateReason(disabledReason);

      // Persist to admin_alerts table
      await supabaseAdmin.from("admin_alerts").insert({
        type:              "stripe_account_restricted",
        creator_id:        creatorId,
        stripe_account_id: stripeAccountId,
        reason:            disabledReason ?? "Stripe high-risk flag detected",
        metadata:          { currently_due: currentlyDue, past_due: pastDue, pending_verification: pendingVerification },
        created_at:        new Date().toISOString(),
      }).then(() => {}, (_e: unknown) => {});

      // Also send live admin notification
      sendAdminAlert({
        subject: `Creator account restricted — action needed`,
        body:
          `A creator's Stripe account has been restricted and they can no longer receive tips or payouts.\n` +
          `\n` +
          `Reason: ${reasonReadable}\n` +
          (pastDueReadable.length > 0
            ? `\nOverdue items (${pastDueReadable.length}):\n${pastDueReadable.map(i => `  • ${i}`).join("\n")}\n`
            : "") +
          (currentlyDueReadable.length > 0
            ? `\nNeeds to complete (${currentlyDueReadable.length}):\n${currentlyDueReadable.map(i => `  • ${i}`).join("\n")}\n`
            : "") +
          (pendingReadable.length > 0
            ? `\nWaiting on Stripe to verify:\n${pendingReadable.map(i => `  • ${i}`).join("\n")}`
            : ""),
        severity: "critical",
        meta: {
          stripe_account_id:   stripeAccountId,
          creator_id:          creatorId,
          restriction_reason:  reasonReadable,
          overdue_items:       pastDueReadable.length,
          items_to_complete:   currentlyDueReadable.length,
          charges_enabled:     chargesEnabled ? "Yes" : "No",
          payouts_enabled:     payoutsEnabled ? "Yes" : "No",
        },
      });
      } // end 24 h deduplication else
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
