import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createSupabaseRouteClient();
  const next = searchParams.get("next");
  const code = searchParams.get("code");

  if (code) {
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    if (data?.user) await syncProfileEmail(data.user.id, data.user.email ?? null);
    return NextResponse.redirect(`${origin}${next ?? "/dashboard"}`);
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "signup"
    | "recovery"
    | "email_change"
    | "invite"
    | null;

  if (token_hash && type) {
    const { data } = await supabase.auth.verifyOtp({ type, token_hash });
    if (data?.user) await syncProfileEmail(data.user.id, data.user.email ?? null);
    const dest = type === "recovery" ? "/reset-password" : (next ?? "/dashboard");
    return NextResponse.redirect(`${origin}${dest}`);
  }

  return NextResponse.redirect(`${origin}/login`);
}

/**
 * Ensures profiles.email is populated and user_settings row exists.
 * Non-blocking: failures don't break the auth flow.
 */
async function syncProfileEmail(userId: string, email: string | null) {
  try {
    if (email) {
      await supabaseAdmin
        .from("profiles")
        .update({ email })
        .eq("user_id", userId)
        .is("email", null);
    }
    // Ensure user_settings row exists with defaults
    await supabaseAdmin
      .from("user_settings")
      .upsert(
        { user_id: userId, notify_tips: true, notify_payouts: true, notify_security: true },
        { onConflict: "user_id", ignoreDuplicates: true }
      );
  } catch (_) {}
}
