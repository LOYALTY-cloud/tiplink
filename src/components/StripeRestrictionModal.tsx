"use client";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111111] p-6 text-white shadow-2xl">

        {/* HEADER */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="mt-2 text-sm text-white/70">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            Close
          </button>
        </div>

        {/* STATUS */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Verification Status</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
              {verificationStatus ?? "unknown"}
            </span>
          </div>
          <div className="mt-4 space-y-2 text-sm text-white/70">
            <div>Charges Enabled: {chargesEnabled ? "Yes" : "No"}</div>
            <div>Payouts Enabled: {payoutsEnabled ? "Yes" : "No"}</div>
            <div>Monetization Enabled: {monetizationEnabled ? "Yes" : "No"}</div>
          </div>
        </div>

        {/* CURRENTLY DUE */}
        {currentlyDue.length > 0 && (
          <div className="mb-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
            <h3 className="mb-3 text-sm font-semibold text-yellow-300">
              Information Required
            </h3>
            <ul className="space-y-2 text-sm text-yellow-100/80">
              {currentlyDue.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* PENDING VERIFICATION */}
        {pendingVerification.length > 0 && (
          <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
            <h3 className="mb-3 text-sm font-semibold text-blue-300">
              Verification Pending
            </h3>
            <ul className="space-y-2 text-sm text-blue-100/80">
              {pendingVerification.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* CAPABILITIES */}
        {inactiveCapabilities.length > 0 && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <h3 className="mb-3 text-sm font-semibold text-red-300">
              Restricted Features
            </h3>
            <div className="space-y-2 text-sm text-red-100/80">
              {inactiveCapabilities.map(([name, status]) => (
                <div key={name} className="flex items-center justify-between">
                  <span>{name}</span>
                  <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs uppercase">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DISABLED REASON */}
        {disabledReason && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100/80">
            <span className="font-semibold text-red-300">Stripe Status:</span>{" "}
            {disabledReason}
          </div>
        )}

        {/* ACTIONS */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {hasActionableRequirements && (
            <a
              href={onboardingLink}
              className="flex-1 rounded-2xl bg-white px-4 py-3 text-center font-semibold text-black transition hover:opacity-90"
            >
              Resolve Verification Issues
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            Continue To Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
