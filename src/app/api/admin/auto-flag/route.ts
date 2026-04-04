import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"
import { requireRole } from "@/lib/auth/requireRole"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, "restrict")

    const { userId, score, patterns } = await req.json()

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    if (typeof score !== "number" || score < 70) {
      return NextResponse.json({ flagged: false, skipped: true, reason: "score_below_threshold" })
    }

    const clampedScore = Math.min(score, 100)

    // 1. Check current state — prevent duplicate flags
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_flagged, risk_score, last_fraud_score, last_flagged_at")
      .eq("id", userId)
      .single()

    if (profile?.is_flagged && profile.risk_score >= clampedScore) {
      // Already flagged with same or higher score — skip
      return NextResponse.json({
        flagged: false,
        skipped: true,
        reason: "already_flagged",
        current_score: profile.risk_score,
      })
    }

    // Check cooldown — don't re-flag within 10 minutes
    if (profile?.last_flagged_at) {
      const elapsed = Date.now() - new Date(profile.last_flagged_at).getTime()
      if (elapsed < 10 * 60 * 1000) {
        return NextResponse.json({
          flagged: false,
          skipped: true,
          reason: "cooldown",
          cooldown_remaining_ms: 10 * 60 * 1000 - elapsed,
        })
      }
    }

    // 2. Update profile with flag + score tracking
    const updatePayload: Record<string, unknown> = {
      risk_score: clampedScore,
      is_flagged: true,
      last_fraud_score: clampedScore,
      last_flagged_at: new Date().toISOString(),
      risk_level: clampedScore >= 80 ? "high" : clampedScore >= 40 ? "medium" : "low",
    }

    // Soft restriction: score >= 90 → require verification
    if (clampedScore >= 90) {
      updatePayload.verification_required = true
      updatePayload.verification_reason = "Auto-triggered: fraud score " + clampedScore
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId)

    if (error) {
      return NextResponse.json({ error: "Failed to flag user" }, { status: 500 })
    }

    // 3. Store fraud score history
    await supabaseAdmin.from("fraud_score_history").insert({
      user_id: userId,
      score: clampedScore,
      level: clampedScore >= 70 ? "high" : clampedScore >= 30 ? "medium" : "low",
      patterns: patterns ?? [],
      source: "timeline_analysis",
    })

    // 4. Generate real-time alert
    const previousScore = profile?.last_fraud_score ?? 0
    const scoreDelta = clampedScore - previousScore
    const isRepeatFlag = !!profile?.last_flagged_at

    let alertType = "high_risk_score"
    let alertSeverity: "high" | "critical" = "high"
    let alertMessage = `User auto-flagged with fraud score ${clampedScore}/100`

    if (scoreDelta >= 30) {
      alertType = "rapid_score_increase"
      alertSeverity = "critical"
      alertMessage = `Fraud score jumped +${scoreDelta} (${previousScore} → ${clampedScore})`
    } else if (isRepeatFlag) {
      alertType = "repeat_flag"
      alertMessage = `User re-flagged (score: ${clampedScore}, previously flagged at ${profile.last_flagged_at})`
    }

    if (clampedScore >= 90) {
      alertSeverity = "critical"
      alertMessage += " — verification required"
    }

    await supabaseAdmin.from("fraud_alerts").insert({
      user_id: userId,
      alert_type: alertType,
      severity: alertSeverity,
      message: alertMessage,
      metadata: { score: clampedScore, previous_score: previousScore, patterns: patterns ?? [] },
    })

    // 5. Log the auto-flag action
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: session.userId,
      action: "auto_flag",
      target_user: userId,
      severity: "high",
      metadata: {
        score: clampedScore,
        previous_score: previousScore,
        score_delta: scoreDelta,
        source: "timeline_analysis",
        verification_required: clampedScore >= 90,
        repeat_flag: isRepeatFlag,
      },
    })

    return NextResponse.json({
      flagged: true,
      score: clampedScore,
      previous_score: previousScore,
      verification_required: clampedScore >= 90,
      alert_type: alertType,
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
