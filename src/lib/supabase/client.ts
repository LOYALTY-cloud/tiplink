import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

/**
 * Lazy Proxy — the real client is only instantiated on first property access
 * (inside a browser effect/handler), never at module-evaluation time.
 * This prevents Next.js build/prerender from crashing when env vars are absent.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_supabase) {
      _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        // No flowType override — use Supabase default (implicit/auto).
        // PKCE mode can cause setSession() to fail on first call after a
        // server-side signInWithPassword because the client tries to
        // validate the code verifier that doesn't exist in this flow.
      );
    }
    return Reflect.get(_supabase, prop, receiver);
  },
});
