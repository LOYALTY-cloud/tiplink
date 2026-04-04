import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * POST /api/auth/forgot-password
 * Server-side password reset request.
 * Using the server client ensures the PKCE code_verifier is stored in cookies
 * (not localStorage), so the auth callback can exchange the code reliably.
 */
export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Rate limit: 3/hour per email, 10/hour per IP
    const ip = getClientIp(req);
    const [byEmail, byIp] = await Promise.all([
      rateLimit(`forgot:${email.trim().toLowerCase()}`, 3, 3600),
      rateLimit(`forgot-ip:${ip}`, 10, 3600),
    ]);
    if (!byEmail.allowed || !byIp.allowed) {
      return NextResponse.json({ error: "Too many reset requests. Try again later." }, { status: 429 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(req.url).origin;
    const redirectTo = `${siteUrl}/auth/callback?next=/reset-password`;

    const supabase = await createSupabaseRouteClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
