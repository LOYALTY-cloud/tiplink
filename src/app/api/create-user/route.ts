import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/create-user
 * Called after signup to ensure profile has email synced
 * and user_settings row exists with default notification prefs.
 */
export async function POST(req: Request) {
  try {
    const { userId, email } = await req.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Sync email to profile (only if not already set)
    if (email && typeof email === "string") {
      await supabaseAdmin
        .from("profiles")
        .update({ email })
        .eq("user_id", userId)
        .is("email", null);
    }

    // Ensure user_settings row exists with notification defaults
    await supabaseAdmin
      .from("user_settings")
      .upsert(
        { user_id: userId, notify_tips: true, notify_payouts: true, notify_security: true },
        { onConflict: "user_id", ignoreDuplicates: true }
      );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
