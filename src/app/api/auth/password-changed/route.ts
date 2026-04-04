import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/auth/password-changed
 * Called after a successful password update to send a confirmation email.
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

    await createNotification({
      userId: user.id,
      type: "security",
      title: "Your 1neLink password was changed",
      body: "Your password was just changed.",
      meta: {
        action: "password_changed",
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
