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

  // Supabase's new key format: publishable keys start with sb_publishable_ and
  // are anon-level. Service keys start with sb_secret_. Reject any publishable
  // key even if it differs from NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g. wrong project).
  if (serviceKey.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is set to a publishable (anon-level) key. " +
      "Use the project service key (sb_secret_...) for server-side admin access. " +
      "Server routes (Stripe webhook/admin writes) will fail under RLS with an anon key."
    );
  }

  // Legacy JWT-style anon key check (older Supabase projects).
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
