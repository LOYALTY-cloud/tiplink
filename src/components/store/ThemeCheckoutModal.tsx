"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  label,
  badge,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition border-b-2 disabled:cursor-not-allowed disabled:opacity-60 " +
        (active
          ? "border-white text-white"
          : "border-transparent text-white/40 hover:text-white/70")
      }
    >
      {label}
      {badge && (
        <span className="rounded-full bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 font-semibold leading-none">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Card form (Stripe Elements) ───────────────────────────────────────────────

function CardForm({
  themeId,
  price,
  isLegacy,
  onProcessingChange,
}: {
  themeId: string;
  price: number;
  isLegacy: boolean;
  onProcessingChange?: (isProcessing: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onProcessingChange?.(paying);
  }, [paying, onProcessingChange]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || paying) return;

    setPaying(true);
    setError(null);

    let result;
    try {
      const returnUrl = `${window.location.origin}/store`;
      result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: returnUrl,
        },
      });
    } catch {
      setError("Payment could not be started. Please try again.");
      setPaying(false);
      return;
    }

    if (result.error) {
      setError(result.error.message ?? "Payment failed");
      setPaying(false);
      return;
    }

    if (result.paymentIntent?.status !== "succeeded") {
      setError("Payment did not complete. Please try again.");
      setPaying(false);
      return;
    }

    // Server confirms purchase by re-fetching PaymentIntent from Stripe
    try {
      const token = await getToken();
      const confirmUrl = isLegacy ? "/api/themes/confirm-legacy-purchase" : "/api/themes/confirm-purchase";
      const res = await fetch(confirmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ payment_intent_id: result.paymentIntent.id }),
      });

      const json = await res.json();
      if (!res.ok) {
        console.error("confirm-purchase error:", json);
        setError(
          "Payment succeeded but theme unlock hit an issue. Please check your library or contact support."
        );
        setPaying(false);
        return;
      }

      router.push(isLegacy ? "/dashboard/mythemes" : `/dashboard/mythemes?theme_unlocked=${themeId}`);
    } catch {
      setError("Payment succeeded. If your theme doesn't appear, please contact support.");
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />

      {error && (
        <div className="rounded-lg bg-red-500/15 border border-red-400/25 px-3 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || paying}
        className={
          "w-full py-3.5 rounded-xl font-semibold text-sm transition " +
          (!stripe || !elements || paying
            ? "bg-white/20 text-white/40 cursor-not-allowed"
            : "bg-white text-black hover:bg-white/90 active:scale-[0.98]")
        }
      >
        {paying ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner /> Processing…
          </span>
        ) : (
          `Pay $${price.toFixed(2)}`
        )}
      </button>
    </form>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckoutTheme = {
  id: string;
  name: string;
  price: number;
};

type PayMethod = "balance" | "card";

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function ThemeCheckoutModal({
  theme,
  onClose,
  isLegacy = false,
}: {
  theme: CheckoutTheme;
  onClose: () => void;
  isLegacy?: boolean;
}) {
  const router = useRouter();

  // ── Free theme claim state ────────────────────────────────────────────────
  const isFree = theme.price <= 0;
  const [freeClaiming, setFreeClaiming] = useState(false);
  const [freeError, setFreeError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // selected payment method
  const [method, setMethod] = useState<PayMethod>("balance");

  // balance pay state
  const [balancePaying, setBalancePaying] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [cardPaying, setCardPaying] = useState(false);

  // card: PaymentIntent client secret
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [alreadyOwned, setAlreadyOwned] = useState(false);

  const canPayWithBalance = balance !== null && balance >= theme.price;
  const isProcessing = freeClaiming || balancePaying || cardPaying;

  // ── 1. Fetch wallet balance on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBalanceLoading(true);
      try {
        // /api/wallet/balance uses cookie auth — browser sends cookies automatically
        const res = await fetch("/api/wallet/balance");
        if (!cancelled && res.ok) {
          const json = await res.json();
          setBalance(Number(json.balance ?? 0));
        } else if (!cancelled) {
          setBalance(0);
        }
      } catch {
        if (!cancelled) setBalance(0);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── 2. Auto-switch to card if balance is insufficient ───────────────────
  useEffect(() => {
    if (!balanceLoading && balance !== null && balance < theme.price) {
      setMethod("card");
    }
  }, [balanceLoading, balance, theme.price]);

  // ── 3. Lazy-load PaymentIntent when card tab is selected ─────────────────
  useEffect(() => {
    if (method !== "card" || clientSecret || intentLoading) return;

    let cancelled = false;
    setIntentLoading(true);
    setIntentError(null);

    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) setIntentError("Please log in to purchase themes.");
          return;
        }

        const piUrl = isLegacy ? "/api/themes/create-legacy-payment-intent" : "/api/themes/create-payment-intent";
        const piBody = isLegacy ? { theme: theme.id } : { theme_id: theme.id };
        const res = await fetch(piUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(piBody),
        });

        const json = await res.json();
        if (!cancelled) {
          if (!res.ok) {
            if (json.error === "You cannot purchase your own theme") {
              setIntentError("You created this theme — creators can't purchase their own themes.");
            } else {
              setIntentError(json.error ?? "Could not start checkout. Please try again.");
            }
          } else if (json.already_owned) {
            setAlreadyOwned(true);
          } else {
            setClientSecret(json.clientSecret);
          }
        }
      } catch {
        if (!cancelled) setIntentError("Network error. Please try again.");
      } finally {
        if (!cancelled) setIntentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [method]);

  // ── 4. Pay with balance ──────────────────────────────────────────────────
  async function handleBalancePay() {
    if (!canPayWithBalance) return;
    setBalancePaying(true);
    setBalanceError(null);

    try {
      const token = await getToken();
      if (!token) {
        setBalanceError("Session expired. Please reload and try again.");
        return;
      }

      const balanceUrl = isLegacy ? "/api/themes/purchase-with-balance" : "/api/themes/buy-with-balance";
      const balanceBody = isLegacy ? { theme: theme.id } : { theme_id: theme.id };
      const res = await fetch(balanceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(balanceBody),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.error === "You cannot purchase your own theme") {
          setBalanceError("You created this theme — creators can't purchase their own themes.");
          return;
        }
        if (json.insufficient_balance || json.error === "insufficient_balance") {
          // Balance changed between load and pay — switch to card
          setBalance(Number(json.balance ?? 0));
          setMethod("card");
          return;
        }
        setBalanceError(json.error ?? "Purchase failed. Please try again.");
        return;
      }

      router.push(isLegacy ? "/dashboard/mythemes" : `/dashboard/mythemes?theme_unlocked=${theme.id}`);
    } catch {
      setBalanceError("Something went wrong. Please try again.");
    } finally {
      setBalancePaying(false);
    }
  }

  // ── ESC + scroll lock ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isProcessing) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, isProcessing]);

  // ── Stripe Elements options ──────────────────────────────────────────────
  const elementsOptions = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: {
              theme: "night" as const,
              variables: {
                colorPrimary: "#ffffff",
                colorBackground: "#111827",
                colorText: "#f9fafb",
                colorDanger: "#f87171",
                borderRadius: "10px",
                fontFamily: "Inter, system-ui, sans-serif",
              },
            },
          }
        : null,
    [clientSecret]
  );

  const remaining = balance !== null ? balance - theme.price : null;

  // ── Free claim handler ───────────────────────────────────────────────────
  async function handleFreeClaim() {
    setFreeClaiming(true);
    setFreeError(null);
    try {
      const token = await getToken();
      if (!token) {
        setFreeError("Please log in to claim this theme.");
        return;
      }
      const res = await fetch("/api/themes/market-free-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme_id: theme.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "You cannot unlock your own theme") {
          setFreeError("You created this theme — creators can't claim their own themes.");
        } else {
          setFreeError(json.error ?? "Could not claim theme. Please try again.");
        }
        return;
      }
      if (json.already_owned) {
        setAlreadyOwned(true);
        return;
      }
      router.push(`/dashboard/mythemes?theme_unlocked=${theme.id}`);
    } catch {
      setFreeError("Something went wrong. Please try again.");
    } finally {
      setFreeClaiming(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (isProcessing) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-[#0e1420] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
          <div>
            <p className="text-sm font-semibold text-white">{theme.name}</p>
            <p className="text-xs text-white/50 mt-0.5">{isFree ? "Free · add to your collection" : `$${theme.price.toFixed(2)} · one-time purchase`}</p>
          </div>
          <button
            onClick={() => {
              if (!isProcessing) onClose();
            }}
            disabled={isProcessing}
            className="w-8 h-8 rounded-lg bg-white/6 hover:bg-white/12 flex items-center justify-center transition"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Free claim UI — replaces tabs + body */}
        {isFree && (
          <div className="px-5 py-6 space-y-4">
            {alreadyOwned ? (
              <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/25 px-4 py-4 text-sm text-emerald-300 space-y-3">
                <p className="font-medium">✓ You already own this theme!</p>
                <p className="text-emerald-300/70 text-xs">This theme is already in your library. Head to My Themes to apply it.</p>
                <button
                  onClick={() => router.push("/dashboard/mythemes")}
                  className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 text-xs font-semibold py-2 rounded-lg transition"
                >
                  Go to My Themes →
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 px-4 py-4 text-center">
                  <p className="text-2xl font-black text-emerald-300 mb-1">Free</p>
                  <p className="text-xs text-white/50">No payment needed — add instantly to your collection</p>
                </div>
                {freeError && (
                  <div className="rounded-lg bg-red-500/15 border border-red-400/25 px-3.5 py-2.5 text-sm text-red-300">
                    {freeError}
                  </div>
                )}
                <button
                  onClick={handleFreeClaim}
                  disabled={freeClaiming}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {freeClaiming ? (
                    <span className="flex items-center justify-center gap-2"><Spinner /> Claiming…</span>
                  ) : (
                    "Claim Free Theme"
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Method tabs (paid only) */}
        {!isFree && (
        <div className="flex border-b border-white/8">
          <TabButton
            active={method === "balance"}
            onClick={() => {
              if (!isProcessing) setMethod("balance");
            }}
            label={
              balanceLoading
                ? "Balance"
                : canPayWithBalance
                ? `Balance · $${balance!.toFixed(2)}`
                : "Balance"
            }
            badge={!balanceLoading && !canPayWithBalance ? "Insufficient" : undefined}
            disabled={isProcessing}
          />
          <TabButton
            active={method === "card"}
            onClick={() => {
              if (!isProcessing) setMethod("card");
            }}
            label="Debit / Card"
            disabled={isProcessing}
          />
        </div>
        )}

        {cardPaying && (
          <div className="mx-5 mt-4 rounded-lg border border-sky-300/25 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200/90 flex items-center gap-2">
            <Spinner className="w-3.5 h-3.5" /> Payment is processing. Please do not close this window.
          </div>
        )}

        {/* Body (paid only) */}
        {!isFree && (
        <div className="px-5 py-5 min-h-[180px]">  

          {/* Balance tab */}
          {method === "balance" && (
            <div className="space-y-4">
              {balanceLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/40 py-6 justify-center">
                  <Spinner /> Checking balance…
                </div>
              ) : (
                <>
                  {/* Balance summary */}
                  <div className="rounded-xl bg-white/4 border border-white/8 px-4 py-3.5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Your balance</span>
                      <span className="font-medium text-white">${balance!.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Theme price</span>
                      <span className="font-medium text-white">−${theme.price.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/8" />
                    <div className="flex justify-between">
                      <span className="text-white/60">Remaining</span>
                      <span className={"font-semibold " + (canPayWithBalance ? "text-emerald-400" : "text-red-400")}>
                        {canPayWithBalance
                          ? `$${remaining!.toFixed(2)}`
                          : `−$${Math.abs(remaining!).toFixed(2)} short`}
                      </span>
                    </div>
                  </div>

                  {/* Insufficient balance nudge */}
                  {!canPayWithBalance && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-400/25 px-3.5 py-3 text-sm text-amber-300/90">
                      Your balance isn&apos;t enough to cover this purchase.{" "}
                      <button
                        className="underline underline-offset-2 font-medium hover:text-amber-200 transition"
                        onClick={() => {
                          if (!isProcessing) setMethod("card");
                        }}
                        disabled={isProcessing}
                      >
                        Pay with card instead
                      </button>
                    </div>
                  )}

                  {balanceError && (
                    <div className="rounded-lg bg-red-500/15 border border-red-400/25 px-3 py-2.5 text-sm text-red-300">
                      {balanceError}
                    </div>
                  )}

                  <button
                    onClick={handleBalancePay}
                    disabled={!canPayWithBalance || balancePaying || isProcessing}
                    className={
                      "w-full py-3.5 rounded-xl font-semibold text-sm transition " +
                      (!canPayWithBalance || balancePaying || isProcessing
                        ? "bg-white/10 text-white/30 cursor-not-allowed"
                        : "bg-white text-black hover:bg-white/90 active:scale-[0.98]")
                    }
                  >
                    {balancePaying ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner /> Processing…
                      </span>
                    ) : canPayWithBalance ? (
                      `Pay $${theme.price.toFixed(2)} from balance`
                    ) : (
                      "Insufficient balance"
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Card tab */}
          {method === "card" && (
            <div>
              {/* Contextual note if they have some balance but not enough */}
              {!balanceLoading && balance !== null && balance > 0 && !canPayWithBalance && (
                <div className="mb-4 rounded-lg bg-white/4 border border-white/8 px-3.5 py-2.5 text-xs text-white/50">
                  Your balance (${balance.toFixed(2)}) doesn&apos;t cover ${theme.price.toFixed(2)} — pay with card below.
                </div>
              )}

              {intentLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/40 py-6 justify-center">
                  <Spinner /> Loading payment form…
                </div>
              ) : alreadyOwned ? (
                <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/25 px-4 py-4 text-sm text-emerald-300 space-y-3">
                  <p className="font-medium">✓ You already own this theme!</p>
                  <p className="text-emerald-300/70 text-xs">This theme is already in your library. Head to My Themes to apply it.</p>
                  <button
                    onClick={() => router.push("/dashboard/mythemes")}
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 text-xs font-semibold py-2 rounded-lg transition"
                  >
                    Go to My Themes →
                  </button>
                </div>
              ) : intentError ? (
                <div className="rounded-lg bg-red-500/15 border border-red-400/25 px-4 py-3 text-sm text-red-300">
                  {intentError}
                </div>
              ) : clientSecret && elementsOptions && stripePromise ? (
                <Elements stripe={stripePromise} options={elementsOptions}>
                  <CardForm
                    themeId={theme.id}
                    price={theme.price}
                    isLegacy={isLegacy}
                    onProcessingChange={setCardPaying}
                  />
                </Elements>
              ) : null}
            </div>
          )}
        </div>

        )}

        {/* Footer */}
        <div className="px-5 pb-5 pt-0">
          <button
            onClick={() => {
              if (!isProcessing) onClose();
            }}
            disabled={isProcessing}
            className="w-full text-sm text-white/40 hover:text-white/60 transition py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
