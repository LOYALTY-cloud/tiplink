import { NextResponse } from "next/server";

/**
 * GET /auth/confirm
 *
 * Handles recovery/verify/invite links with token_hash + type params.
 * Redirects to /auth/callback using the configured site URL to avoid
 * port-duplication issues in Codespace/proxy environments.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const params = searchParams.toString();
  return NextResponse.redirect(`${siteUrl}/auth/callback${params ? `?${params}` : ""}`);
}
