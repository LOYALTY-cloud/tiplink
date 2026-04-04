import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client for admin pages — no auth session persistence or token refresh.
 * Admin auth uses admin_id via localStorage, not Supabase auth.
 * This client is used only for realtime subscriptions and direct DB reads.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
	},
});
