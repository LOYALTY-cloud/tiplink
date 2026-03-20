import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const token = searchParams.get("token");

  if (code || (tokenHash && type)) {
    const supabase = await createSupabaseRouteClient();

    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
      return NextResponse.redirect(`${origin}/verify?status=success`);
    }

    await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return NextResponse.redirect(`${origin}/verify?status=success`);
  }

  if (!token) {
    return NextResponse.redirect(`${origin}/verify?status=missing`);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.redirect(`${origin}/verify?status=error`);
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const verificationHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const { data: record, error } = await supabaseAdmin
    .from("email_verifications")
    .select("id, email, user_id, expires_at, used_at")
    .eq("token_hash", verificationHash)
    .maybeSingle();

  if (error || !record) {
    return NextResponse.redirect(`${origin}/verify?status=invalid`);
  }

  if (record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${origin}/verify?status=expired`);
  }

  await supabaseAdmin
    .from("email_verifications")
    .update({ used_at: new Date().toISOString() })
    .eq("id", record.id);

  if (record.user_id) {
    // Mark verified AND sync email to profile so notifications work
    await supabaseAdmin
      .from("profiles")
      .update({ email_verified: true, email: record.email })
      .eq("user_id", record.user_id);

    // Ensure user_settings row exists with defaults
    await supabaseAdmin
      .from("user_settings")
      .upsert(
        { user_id: record.user_id, notify_tips: true, notify_payouts: true, notify_security: true },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
      .then(() => {})
      .catch(() => {});
  }

  return NextResponse.redirect(`${origin}/verify?status=success`);
}
