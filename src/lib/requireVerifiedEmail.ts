import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Check that a user's email is verified.
 * Uses the `email_verified` column on profiles (set by /verify/callback).
 * Returns the user_id on success, or throws with a message suitable for API responses.
 */
export async function requireVerifiedEmail(userId: string): Promise<void> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email_verified")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.email_verified) {
    const err = new Error("Please verify your email before using this feature");
    (err as any).statusCode = 403;
    throw err;
  }
}
