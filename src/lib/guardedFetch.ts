import { getSessionLock } from "@/lib/sessionLock"

/**
 * Drop-in replacement for fetch() that rejects when the session is locked.
 * Prevents background API calls from executing while the user is locked out.
 *
 * Usage: replace `fetch(url, opts)` with `guardedFetch(url, opts)`
 * Or use the `guardFetch()` monkey-patch for global coverage.
 */
export function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (getSessionLock()) {
    return Promise.reject(new Error("Session locked — request blocked"))
  }
  return fetch(input, init)
}

let _originalFetch: typeof fetch | null = null

/**
 * Monkey-patch global fetch so ALL client-side requests are blocked while locked.
 * Call once at app boot (e.g. in dashboard layout useEffect).
 * Allowlisted paths (like verify-password) still go through.
 */
export function guardFetch() {
  if (_originalFetch) return // already patched

  _originalFetch = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (getSessionLock()) {
      // Allow the unlock endpoint through
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("/api/auth/verify-password") || url.includes("/auth/v1/")) {
        return _originalFetch!(input, init)
      }
      return Promise.reject(new Error("Session locked — request blocked"))
    }
    return _originalFetch!(input, init)
  }
}

/** Restore original fetch (cleanup) */
export function unguardFetch() {
  if (_originalFetch) {
    window.fetch = _originalFetch
    _originalFetch = null
  }
}
