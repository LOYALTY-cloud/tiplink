"use client";

/* ── Plain-English translations for Stripe API codes ─────────────────────── */

const REQUIREMENT_LABELS: Record<string, string> = {
  // Identity
  "individual.first_name": "Your first name",
  "individual.last_name": "Your last name",
  "individual.dob.day": "Your date of birth",
  "individual.dob.month": "Your date of birth",
  "individual.dob.year": "Your date of birth",
  "individual.dob": "Your date of birth",
  "individual.address.line1": "Your street address",
  "individual.address.city": "Your city",
  "individual.address.state": "Your state / province",
  "individual.address.postal_code": "Your zip / postal code",
  "individual.address.country": "Your country",
  "individual.ssn_last_4": "Last 4 digits of your SSN",
  "individual.id_number": "Your government ID number",
  "individual.phone": "Your phone number",
  "individual.email": "Your email address",
  // Verification documents
  "individual.verification.document": "A photo of your government-issued ID",
  "individual.verification.additional_document": "A secondary ID document",
  "individual.verification.proof_of_liveness": "A selfie or live photo for identity confirmation",
  // Business
  "business_profile.url": "Your website or social media URL",
  "business_profile.mcc": "Your business category",
  "business_profile.product_description": "A short description of your content or services",
  "business_type": "Your account type (individual or business)",
  // Bank / payout
  "external_account": "Your bank account details",
  "bank_account": "Your bank account details",
  "tos_acceptance.date": "Acceptance of the Terms of Service",
  "tos_acceptance.ip": "Acceptance of the Terms of Service",
  "tos_acceptance": "Acceptance of the Terms of Service",
};

const CAPABILITY_LABELS: Record<string, string> = {
  card_payments: "Accepting card payments",
  transfers: "Sending payouts to your bank",
  us_bank_account_ach_payments: "ACH bank payments",
  link_payments: "Link payments",
  affirm_payments: "Affirm buy-now-pay-later",
  klarna_payments: "Klarna payments",
  afterpay_clearpay_payments: "Afterpay / Clearpay",
  ideal_payments: "iDEAL payments",
  sofort_payments: "Sofort payments",
  sepa_debit_payments: "SEPA direct debit",
  bacs_debit_payments: "Bacs direct debit",
  bancontact_payments: "Bancontact payments",
  giropay_payments: "Giropay payments",
  p24_payments: "Przelewy24 payments",
  eps_payments: "EPS payments",
  paynow_payments: "PayNow payments",
  grabpay_payments: "GrabPay payments",
  oxxo_payments: "OXXO payments",
  boleto_payments: "Boleto payments",
  tax_reporting_us_1099_k: "US tax reporting (1099-K)",
  tax_reporting_us_1099_misc: "US tax reporting (1099-MISC)",
  treasury: "Financial account access",
};

const DISABLED_REASON_LABELS: Record<string, string> = {
  "action_required.requested_capabilities":
    "We need you to confirm which payment features you want enabled.",
  "listed": "Your account has been flagged for review by our payments partner.",
  "other": "Your account is under review. Our team will be in touch shortly.",
  "platform_paused": "Payouts are temporarily paused on this platform.",
  "rejected.fraud": "Your account was rejected due to suspected fraudulent activity. Please contact support.",
  "rejected.listed": "Your account was rejected. Please contact support.",
  "rejected.other": "Your account was rejected. Please contact support.",
  "rejected.terms_of_service": "Your account was rejected due to a Terms of Service violation.",
  "requirements.past_due": "Some required information is overdue. Please complete verification to restore access.",
  "requirements.pending_verification": "Your submitted documents are being reviewed. This usually takes 1–2 business days.",
  "under_review": "Your account is currently under review by our payments partner.",
};

const CAPABILITY_STATUS_LABELS: Record<string, string> = {
  inactive: "Not yet active",
  pending: "Under review",
  restricted: "Restricted — action needed",
  restricted_soon: "Will be restricted soon",
  unrequested: "Not requested",
};

function friendlyRequirement(code: string): string {
  if (REQUIREMENT_LABELS[code]) return REQUIREMENT_LABELS[code];
  // Strip trailing field path and try again (e.g. "individual.verification.document.front")
  const parts = code.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const key = parts.slice(0, i).join(".");
    if (REQUIREMENT_LABELS[key]) return REQUIREMENT_LABELS[key];
  }
  // Fallback: humanise the raw code
  return code
    .replace(/_/g, " ")
    .replace(/\./g, " › ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyCapability(name: string): string {
  return CAPABILITY_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyCapabilityStatus(status: string): string {
  return CAPABILITY_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function friendlyDisabledReason(reason: string): string {
  return DISABLED_REASON_LABELS[reason] ?? reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyVerificationStatus(status: string): string {
  const map: Record<string, string> = {
    verified: "Verified",
    unverified: "Not yet verified",
    pending: "Verification in progress",
    restricted: "Restricted",
    unknown: "Unknown",
  };
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StripeRestrictionModal({
  open,
  onClose,
  creator,
}: {
  open: boolean;
  onClose: () => void;
  creator: any;
}) {
  if (!open) return null;

  const disabledReason = creator?.stripe_disabled_reason as string | undefined;
  const currentlyDue = (creator?.stripe_currently_due ?? []) as string[];
  const pendingVerification = (creator?.stripe_pending_verification ?? []) as string[];
  const payoutsEnabled = creator?.stripe_payouts_enabled as boolean | undefined;
  const chargesEnabled = creator?.stripe_charges_enabled as boolean | undefined;
  const verificationStatus = creator?.verification_status as string | undefined;
  const monetizationEnabled = creator?.monetization_enabled as boolean | undefined;

  const hasActionableRequirements =
    currentlyDue.length > 0 || pendingVerification.length > 0;

  let title = "Account Status Update";
  let description = "Your Stripe account status has changed.";
  let severity: "danger" | "warning" | "info" = "warning";

  if (!chargesEnabled || verificationStatus === "restricted") {
    title = "Monetization Restricted";
    description =
      "Your monetization features are temporarily restricted while Stripe reviews your account or additional verification is required.";
    severity = "danger";
  } else if (!payoutsEnabled) {
    title = "Payouts Temporarily Paused";
    description =
      "Your payouts are temporarily paused until Stripe completes additional review or verification.";
    severity = "warning";
  } else if (hasActionableRequirements) {
    title = "Verification Required";
    description =
      "Stripe requires additional information to keep your account active and prevent restrictions.";
    severity = "info";
  }

  const capabilities = (creator?.stripe_capabilities ?? {}) as Record<string, string>;
  const inactiveCapabilities = Object.entries(capabilities).filter(
    ([, value]) => value !== "active"
  );

  // Deduplicate requirements that map to the same human label
  const uniqueDue = Array.from(new Set(currentlyDue.map(friendlyRequirement)));
  const uniquePending = Array.from(new Set(pendingVerification.map(friendlyRequirement)));

  const onboardingLink =
    (creator?.stripe_onboarding_link as string | undefined) ??
    "/api/stripe/connect/refresh";

  const badgeClass =
    severity === "danger"
      ? "bg-red-500/20 text-red-400"
      : severity === "warning"
      ? "bg-yellow-500/20 text-yellow-400"
      : "bg-blue-500/20 text-blue-400";

  return (
    /* Backdrop — bottom-sheet on mobile, centered dialog on sm+ */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 bg-[#111111] text-white shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh]">

        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain px-4 pt-3 pb-4 sm:p-6 space-y-4">

          {/* HEADER */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold leading-tight">{title}</h2>
              <p className="mt-1 text-xs sm:text-sm text-white/60">{description}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full bg-white/10 p-1.5 hover:bg-white/20 transition"
            >
              <svg className="w-4 h-4 text-white/70" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* STATUS */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm text-white/60">Verification Status</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${badgeClass}`}>
                {friendlyVerificationStatus(verificationStatus ?? "unknown")}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:text-sm text-white/70">
              <div className="flex flex-col items-center rounded-xl bg-white/5 p-2 gap-0.5">
                <span className="font-semibold text-white/90">{chargesEnabled ? "✓" : "✗"}</span>
                <span className="text-center leading-tight">Charges</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-white/5 p-2 gap-0.5">
                <span className="font-semibold text-white/90">{payoutsEnabled ? "✓" : "✗"}</span>
                <span className="text-center leading-tight">Payouts</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-white/5 p-2 gap-0.5">
                <span className="font-semibold text-white/90">{monetizationEnabled ? "✓" : "✗"}</span>
                <span className="text-center leading-tight">Monetize</span>
              </div>
            </div>
          </div>

          {/* CURRENTLY DUE */}
          {uniqueDue.length > 0 && (
            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-3 sm:p-4">
              <h3 className="mb-2 text-xs sm:text-sm font-semibold text-yellow-300">
                Action Required
              </h3>
              <p className="mb-2 text-xs text-yellow-200/60">Please provide the following to restore full access:</p>
              <ul className="space-y-1.5 text-xs sm:text-sm text-yellow-100/80">
                {uniqueDue.map((item) => (
                  <li key={item} className="flex gap-1.5"><span>•</span><span>{item}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* PENDING VERIFICATION */}
          {uniquePending.length > 0 && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 sm:p-4">
              <h3 className="mb-2 text-xs sm:text-sm font-semibold text-blue-300">
                Under Review
              </h3>
              <p className="mb-2 text-xs text-blue-200/60">These items have been submitted and are being reviewed — no action needed right now:</p>
              <ul className="space-y-1.5 text-xs sm:text-sm text-blue-100/80">
                {uniquePending.map((item) => (
                  <li key={item} className="flex gap-1.5"><span>•</span><span>{item}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* CAPABILITIES */}
          {inactiveCapabilities.length > 0 && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 sm:p-4">
              <h3 className="mb-2 text-xs sm:text-sm font-semibold text-red-300">
                Features Currently Unavailable
              </h3>
              <div className="space-y-1.5 text-xs sm:text-sm text-red-100/80">
                {inactiveCapabilities.map(([name, status]) => (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{friendlyCapability(name)}</span>
                    <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs">
                      {friendlyCapabilityStatus(status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DISABLED REASON */}
          {disabledReason && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 sm:p-4 text-xs sm:text-sm text-red-100/80">
              {friendlyDisabledReason(disabledReason)}
            </div>
          )}

        </div>

        {/* ACTIONS — pinned to bottom */}
        <div className="px-4 pb-5 pt-2 sm:px-6 sm:pb-6 flex flex-col gap-2.5 sm:flex-row border-t border-white/5">
          {hasActionableRequirements && (
            <a
              href={onboardingLink}
              className="flex-1 rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:opacity-90"
            >
              Resolve Verification Issues
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Continue To Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
