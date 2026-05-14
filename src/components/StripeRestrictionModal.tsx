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
                {verificationStatus ?? "unknown"}
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
          {currentlyDue.length > 0 && (
            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-3 sm:p-4">
              <h3 className="mb-2 text-xs sm:text-sm font-semibold text-yellow-300">
                Information Required
              </h3>
              <ul className="space-y-1.5 text-xs sm:text-sm text-yellow-100/80">
                {currentlyDue.map((item) => (
                  <li key={item} className="flex gap-1.5"><span>•</span><span>{item}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* PENDING VERIFICATION */}
          {pendingVerification.length > 0 && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 sm:p-4">
              <h3 className="mb-2 text-xs sm:text-sm font-semibold text-blue-300">
                Verification Pending
              </h3>
              <ul className="space-y-1.5 text-xs sm:text-sm text-blue-100/80">
                {pendingVerification.map((item) => (
                  <li key={item} className="flex gap-1.5"><span>•</span><span>{item}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* CAPABILITIES */}
          {inactiveCapabilities.length > 0 && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 sm:p-4">
              <h3 className="mb-2 text-xs sm:text-sm font-semibold text-red-300">
                Restricted Features
              </h3>
              <div className="space-y-1.5 text-xs sm:text-sm text-red-100/80">
                {inactiveCapabilities.map(([name, status]) => (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs uppercase">
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DISABLED REASON */}
          {disabledReason && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 sm:p-4 text-xs sm:text-sm text-red-100/80">
              <span className="font-semibold text-red-300">Stripe Status:</span>{" "}
              {disabledReason}
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
