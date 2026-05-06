import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const supabase = await createSupabaseRouteClient();
  const next = searchParams.get("next");
  const code = searchParams.get("code");

  if (code) {
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    if (data?.user) await syncProfileEmail(data.user.id, data.user.email ?? null);
    return NextResponse.redirect(`${baseUrl}${next ?? "/dashboard"}`);
  }

  const token = searchParams.get("token");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "signup"
    | "recovery"
    | "email_change"
    | "invite"
    | null;

  if ((token || token_hash) && type) {
    // For password recovery, redirect to reset-password with the token so
    // the client-side verifyOtp call establishes the session in localStorage.
    if (type === "recovery") {
      const hash = token_hash || token || "";
      return NextResponse.redirect(`${baseUrl}/reset-password?token_hash=${encodeURIComponent(hash)}`);
    }
    const { data } = await supabase.auth.verifyOtp({ type, token_hash: token_hash || token || "" });
    if (data?.user) await syncProfileEmail(data.user.id, data.user.email ?? null);
    const dest = next ?? "/dashboard";
    return NextResponse.redirect(`${baseUrl}${dest}`);
  }

  return NextResponse.redirect(`${baseUrl}/login`);
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
