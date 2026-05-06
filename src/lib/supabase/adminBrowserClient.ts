import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Supabase client for admin pages — no auth session persistence or token refresh.
 * Admin auth uses admin_id via localStorage, not Supabase auth.
 * This client is used only for realtime subscriptions and direct DB reads.
 *
 * Lazy-initialized via Proxy so that importing this module never throws at
 * build/module-eval time when env vars are absent (e.g. during Next.js SSR
 * prerendering in CI).
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_client) {
      _client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );
    }
    return Reflect.get(_client, prop, receiver);
  },
});
