import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createSupabaseRouteClient();
  const code = searchParams.get("code");

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "signup"
    | "recovery"
    | "email_change"
    | "invite"
    | null;

  if (token_hash && type) {
    await supabase.auth.verifyOtp({ type, token_hash });
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  return NextResponse.redirect(`${origin}/login`);
}
