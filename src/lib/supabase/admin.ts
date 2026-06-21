import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabaseAdmin: SupabaseClient | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function assertServerKeyLooksPrivileged(serviceKey: string, anonKey: string | null) {
  if (anonKey && serviceKey === anonKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is set to the anon/public key. " +
      "Server routes (Stripe webhook/admin writes) will fail under RLS."
    );
  }

  // Supabase currently issues secret keys with `sb_secret_` prefix.
  // Keep a fallback for legacy JWT-style service keys while blocking anon/public keys.
  const looksLikeAnon = serviceKey.startsWith("eyJ") && !serviceKey.includes("service_role");
  if (looksLikeAnon) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY appears to be a non-service JWT key. " +
      "Use the project service key (sb_secret_...) for server-side admin access."
    );
  }
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_supabaseAdmin) {
      const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
      const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? null;

      assertServerKeyLooksPrivileged(serviceKey, anonKey);

      _supabaseAdmin = createClient(
        url,
        serviceKey,
        { auth: { persistSession: false } }
      );
    }
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
