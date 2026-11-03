import type Stripe from "stripe";

/**
 * Params for creating a creator's connected account.
 *
 * Accounts have no Stripe Dashboard and 1neLink collects requirements, so the
 * Connect embedded onboarding component runs fully inside 1neLink with no Stripe
 * authentication popup (that popup only appears for Express/Dashboard accounts).
 * Stripe only allows this combination with fees.payer = "application", so the
 * platform pays Stripe processing fees on direct charges.
 *
 * controller.* is immutable after creation; existing Express accounts keep working.
 */
export function connectedAccountParams(email?: string): Stripe.AccountCreateParams {
  return {
    country: "US",
    email,
    business_type: "individual",
    controller: {
      stripe_dashboard: { type: "none" },
      requirement_collection: "application",
      fees: { payer: "application" },
      losses: { payments: "application" },
    },
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: "manual" },
        // Platform bears negative balances (losses.payments = "application"), so
        // let Stripe reclaim refunds/chargebacks/fraud losses from the creator's
        // bank account. Not supported for debit cards.
        debit_negative_balances: true,
      },
    },
  };
}

/**
 * Embedded component config for an AccountSession.
 * With external_account_collection on, Stripe defaults to its own user-authentication
 * popup (connect.stripe.com/d/embedded/...). Stripe only allows turning that off for
 * accounts where the platform collects requirements, so legacy Express accounts
 * (requirement_collection = "stripe") must keep the default or the API call fails.
 * The caller is already authenticated to 1neLink before a session is issued.
 */
export function connectSessionComponents(
  isManageMode: boolean,
  platformCollectsRequirements: boolean
): Stripe.AccountSessionCreateParams.Components {
  const features = {
    external_account_collection: true as const,
    ...(platformCollectsRequirements ? { disable_stripe_user_authentication: true as const } : {}),
  };
  return isManageMode
    ? { account_management: { enabled: true, features } }
    : { account_onboarding: { enabled: true, features } };
}
