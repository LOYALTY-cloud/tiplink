import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/auth/password-changed
 * Called after a successful password update to:
 * 1. Revoke all other sessions (security best practice)
 * 2. Send a confirmation notification
 */
export async function POST() {
  try {
    const supabase = await createSupabaseRouteClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Revoke all sessions for this user globally — forces re-login on all devices
    await supabaseAdmin.auth.admin.signOut(user.id, "global");

    await createNotification({
      userId: user.id,
      type: "security",
      title: "Your 1neLink password was changed",
      body: "Your password was just changed. All other sessions have been signed out.",
      meta: {
        action: "password_changed",
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
