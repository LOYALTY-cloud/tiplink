"use client";

import { useEffect, useRef, useState } from "react";
export default function StripeEmbeddedOnboarding({ clientSecret, mode = "onboarding" }: { clientSecret: string; mode?: "onboarding" | "manage" }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!clientSecret) {
      setStatus("error");
      setError("Missing onboarding session. Please refresh and try again.");
      return;
    }

    let mounted = true;
    let onboardingInstance: any | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!publishableKey) {
          throw new Error("Stripe publishable key is missing");
        }

        timeoutId = setTimeout(() => {
          if (!mounted) return;
          setStatus("error");
          setError("Stripe onboarding is taking too long to load. Please retry.");
        }, 20000);

        const mod = await import("@stripe/connect-js");
        const loadConnect = mod.loadConnect;
        const loader = await loadConnect();
        if (!mounted || !loader) return;

        const connect = loader.initialize({
          publishableKey,
          clientSecret,
          appearance: {
            variables: {
              colorPrimary: "#3B82F6",
              colorBackground: "#0b0f1a",
              colorText: "#f0f0f5",
              colorSecondaryText: "#c0c0cc",
              colorDanger: "#ef4444",
              borderRadius: "12px",
            },
          },
        });

        const componentType = mode === "manage" ? "account-management" : "account-onboarding";
        onboardingInstance = connect.create(componentType as any);

        // Register Stripe lifecycle callbacks BEFORE mounting so we only clear
        // the loading spinner once the embedded component is truly rendered.
        // setOnLoaderDone fires when the Stripe iframe finishes painting.
        if (typeof onboardingInstance?.setOnLoaderDone === "function") {
          onboardingInstance.setOnLoaderDone(() => {
            if (!mounted) return;
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            setStatus("ready");
            setError(null);
          });
        }
        if (typeof onboardingInstance?.setOnLoadError === "function") {
          onboardingInstance.setOnLoadError((e: { error?: { message?: string } }) => {
            if (!mounted) return;
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            setStatus("error");
            setError(e?.error?.message || "Stripe onboarding failed to load.");
          });
        }

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        // Some versions of Connect.js return a component with a `mount` method,
        // other times it returns an HTMLElement to be appended into the DOM.
        let mounted_ok = false;
        if (typeof onboardingInstance?.mount === "function") {
          onboardingInstance.mount(containerRef.current!);
          mounted_ok = true;
        } else if (containerRef.current && onboardingInstance instanceof HTMLElement) {
          containerRef.current.appendChild(onboardingInstance);
          mounted_ok = true;
        } else if (containerRef.current && onboardingInstance?.element) {
          // fallback: some builds wrap the element under `.element`
          containerRef.current.appendChild(onboardingInstance.element);
          mounted_ok = true;
        } else {
          throw new Error("Failed to mount Stripe onboarding component");
        }

        // If setOnLoaderDone isn't available on this build of Connect.js, fall
        // back to clearing the spinner right after mount (original behaviour).
        if (mounted_ok && typeof onboardingInstance?.setOnLoaderDone !== "function" && mounted) {
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
          setStatus("ready");
          setError(null);
        }
      } catch (e: unknown) {
        if (!mounted) return;
        const message = e instanceof Error ? e.message : "Failed to load Stripe onboarding";
        setStatus("error");
        setError(message);
      }
    })();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      try {
        if (typeof onboardingInstance?.destroy === "function") {
          onboardingInstance.destroy();
        } else if (onboardingInstance instanceof HTMLElement) {
          onboardingInstance.remove();
        } else if (onboardingInstance?.element instanceof HTMLElement) {
          onboardingInstance.element.remove();
        }
      } catch (e) {
        /* ignore */
      }
    };
  }, [clientSecret, mode, attempt]);

  return (
    <div className="space-y-3">
      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-white/70">
          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Loading secure onboarding…</span>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p>{error || "Stripe onboarding failed to load."}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-2 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/30 transition"
          >
            Retry
          </button>
        </div>
      )}

      <div ref={containerRef} className="min-h-[320px]" />
    </div>
  );
}
