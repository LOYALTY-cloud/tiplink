import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/logout
 * Clears the server-side admin_jwt HTTP-only cookie.
 * Called alongside client-side localStorage clear.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_jwt", "", {
    httpOnly: true,
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
