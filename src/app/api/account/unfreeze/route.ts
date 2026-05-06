import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { logFreezeEvent } from "@/lib/freezeAudit";

export const runtime = "nodejs";

/**
 * POST /api/account/unfreeze
 *
 * Self-serve unfreeze for auto-frozen accounts.
 * Requires: valid session + password confirmation.
 *
 * Only unfreezes LOW-severity freezes (trust_score, rapid_withdrawals).
 * Chargebacks, multi-account, and admin flags still require support.
 */
export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    // Authenticate via session
    const supabase = await createSupabaseRouteClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify password before allowing unfreeze
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { error: pwError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (pwError) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    // Check current freeze state
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_frozen, freeze_reason, freeze_level, frozen_at, account_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.is_frozen) {
      return NextResponse.json({ error: "Account is not frozen" }, { status: 400 });
    }

    // Hard freeze requires admin review — block self-serve
    if (profile.freeze_level === "hard") {
      return NextResponse.json(
        {
          error: "This restriction requires support review",
          reason: profile.freeze_reason,
          freeze_level: "hard",
          support_url: "https://1nelink.com/dashboard?tab=support",
        },
        { status: 403 }
      );
    }

    // Rate limit: max 3 unfreeze attempts per 24h
    const { count: recentAttempts } = await supabaseAdmin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("target_user", user.id)
      .eq("action", "self_unfreeze")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((recentAttempts ?? 0) >= 3) {
      return NextResponse.json(
        { error: "Too many unfreeze attempts. Please contact support." },
        { status: 429 }
      );
    }

    // Execute unfreeze
    await supabaseAdmin
      .from("profiles")
      .update({
        is_frozen: false,
        freeze_reason: null,
        freeze_level: null,
        frozen_at: null,
        account_status: "active",
        status_reason: null,
      })
      .eq("user_id", user.id);

    // Log the self-serve unfreeze
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: "00000000-0000-0000-0000-000000000000",
      action: "self_unfreeze",
      target_user: user.id,
      severity: "warning",
      metadata: {
        previous_reason: profile.freeze_reason,
        method: "password_verification",
        unfrozen_at: new Date().toISOString(),
      },
    });

    // Audit trail — dedicated freeze log
    await logFreezeEvent({
      userId: user.id,
      action: "unfreeze",
      freezeLevel: profile.freeze_level,
      reason: `Self-serve unfreeze (was: ${profile.freeze_reason ?? "unknown"})`,
      triggeredBy: "self",
      metadata: { method: "password_verification", previous_reason: profile.freeze_reason },
    });

    // Notify user
    try {
      await createNotification({
        userId: user.id,
        type: "security",
        title: "Account restored",
        body: "Your account restrictions have been lifted. You can now withdraw funds normally.",
        meta: { action: "reactivated" },
      });
    } catch (_) {}

    return NextResponse.json({ ok: true, message: "Account unfrozen successfully" });
  } catch (e: unknown) {
    console.error("account/unfreeze", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
