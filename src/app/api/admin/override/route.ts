import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"
import { requireRole } from "@/lib/auth/requireRole"

export const runtime = "nodejs"

type OverrideType =
  | "unflag"
  | "clear_restriction"
  | "bypass_verification"
  | "override_risk_score"
  | "unlock_withdrawal"
  | "manual_flag"
  | "override_withdrawal_limit"

const OVERRIDE_ACTIONS: Record<OverrideType, (userId: string) => Record<string, unknown>> = {
  unflag: () => ({
    is_flagged: false,
  }),
  clear_restriction: () => ({
    account_status: "active",
    restricted_until: null,
    status_reason: null,
  }),
  bypass_verification: () => ({
    verification_required: false,
    verification_reason: null,
  }),
  override_risk_score: () => ({
    risk_score: 0,
    risk_level: "low",
    last_fraud_score: 0,
  }),
  unlock_withdrawal: () => ({
    withdrawal_locked: false,
    payout_hold_until: null,
  }),
  manual_flag: () => ({
    is_flagged: true,
  }),
  override_withdrawal_limit: () => ({
    withdrawal_limit_override: true,
  }),
}

const VALID_TYPES = Object.keys(OVERRIDE_ACTIONS) as OverrideType[]

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, "restrict")

    const { userId, overrideType, reason } = await req.json()

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    if (!VALID_TYPES.includes(overrideType)) {
      return NextResponse.json({ error: "Invalid override type" }, { status: 400 })
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return NextResponse.json({ error: "Reason required (min 5 chars)" }, { status: 400 })
    }

    // 1. Get current state for audit trail
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_flagged, risk_score, risk_level, account_status, verification_required, verification_reason, withdrawal_locked, payout_hold_until, restricted_until, handle, display_name")
      .eq("id", userId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Resolve admin display name for real-time alerts
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, handle")
      .eq("user_id", session.userId)
      .maybeSingle()
    const adminName = adminProfile?.display_name || adminProfile?.handle || session.userId
    const targetHandle = profile.display_name || (profile.handle ? `@${profile.handle}` : userId)

    // 2. Apply the override
    const updates = OVERRIDE_ACTIONS[overrideType as OverrideType](userId)

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId)

    if (updateError) {
      return NextResponse.json({ error: "Failed to apply override" }, { status: 500 })
    }

    // 3. Log to admin_overrides table
    await supabaseAdmin.from("admin_overrides").insert({
      admin_id: session.userId,
      target_user: userId,
      override_type: overrideType,
      previous_value: profile,
      new_value: updates,
      reason: reason.trim(),
    })

    // 4. Log to admin_actions for activity feed visibility
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "admin_override",
      target_user: userId,
      severity: "high",
      metadata: {
        override_type: overrideType,
        reason: reason.trim(),
        admin_name: adminName,
        target_handle: targetHandle,
        previous: profile,
        applied: updates,
      },
    })

    return NextResponse.json({
      success: true,
      override_type: overrideType,
      applied: updates,
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// GET — fetch override history for a user
export async function GET(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, "risk_eval")

    const userId = req.nextUrl.searchParams.get("user_id")
    if (!userId) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("admin_overrides")
      .select("id, admin_id, override_type, previous_value, new_value, reason, created_at")
      .eq("target_user", userId)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch overrides" }, { status: 500 })
    }

    return NextResponse.json({ overrides: data ?? [] })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
