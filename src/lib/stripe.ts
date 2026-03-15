// Lazy Stripe initializer to avoid creating a client at module-evaluation time.
// Use `getStripe()` from `@/lib/stripe/server` (re-exports `getServerStripe`) in handlers.
import { getStripe as _getStripe } from "./stripe/getServerStripe";

let _cached: any = null;

function ensure() {
  if (!_cached) _cached = _getStripe();
  return _cached;
}

// Export a proxy-compatible `stripe` object so existing imports that use
// `import { stripe } from "@/lib/stripe"` continue to work but the real
// Stripe client isn't instantiated until a property is accessed at runtime.
export const stripe = new Proxy(
  {},
  {
    get(_, prop) {
      const s = ensure();
      return (s as any)[prop];
    },
    apply(_, _this, args) {
      const s = ensure();
      return (s as any).apply(_this, args);
    },
  }
) as any;
