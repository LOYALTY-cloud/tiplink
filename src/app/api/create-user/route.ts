import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/create-user
 * Called after signup to ensure profile has email synced
 * and user_settings row exists with default notification prefs.
 */
export async function POST(req: Request) {
  try {
    // Authenticate caller — must be the user being set up
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = authRes.user.id;
    const email = authRes.user.email;

    // Ensure profile row exists (must come before user_settings due to FK constraint)
    const profileData: Record<string, unknown> = { user_id: userId, handle: userId };
    if (email) {
      profileData.email = email;
    }
    await supabaseAdmin
      .from("profiles")
      .upsert(profileData, { onConflict: "user_id", ignoreDuplicates: true });

    // If profile already existed but email was null, sync it
    if (email) {
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
