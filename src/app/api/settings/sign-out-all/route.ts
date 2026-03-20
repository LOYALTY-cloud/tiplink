import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    // Sign out all sessions by revoking refresh tokens via admin API
    const { error } = await supabaseAdmin.auth.admin.signOut(user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Security notification
    try {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        userId: user.id,
        type: "security",
        title: "🔐 Security Alert",
        body: "All devices have been signed out of your account. If this wasn't you, change your password immediately.",
      });
    } catch (_) {}

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return serverError(e);
  }
}

/* ── helpers ────────────────────────────────────────────── */

function extractToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

async function getUser(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function serverError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "Server error");
  return NextResponse.json({ error: msg }, { status: 500 });
}
