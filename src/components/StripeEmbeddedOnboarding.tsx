"use client";

import { useEffect, useRef } from "react";
export default function StripeEmbeddedOnboarding({ clientSecret }: { clientSecret: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!clientSecret) return;

    let mounted = true;
    let onboardingInstance: any | null = null;

    (async () => {
      const mod = await import("@stripe/connect-js");
      const loadConnect = mod.loadConnect;
      const loader = await loadConnect();
      if (!mounted || !loader) return;

      const connect = loader.initialize({
        publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        clientSecret,
      });

      onboardingInstance = connect.create("account-onboarding");
      // Some versions of Connect.js return a component with a `mount` method,
      // other times it returns an HTMLElement to be appended into the DOM.
      if (typeof onboardingInstance?.mount === "function") {
        onboardingInstance.mount(containerRef.current!);
      } else if (containerRef.current && onboardingInstance instanceof HTMLElement) {
        containerRef.current.appendChild(onboardingInstance);
      } else if (containerRef.current && onboardingInstance?.element) {
        // fallback: some builds wrap the element under `.element`
        containerRef.current.appendChild(onboardingInstance.element);
      }
    })();

    return () => {
      mounted = false;
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
  }, [clientSecret]);

  return <div ref={containerRef} />;
}
