import { supabaseAdmin } from "@/lib/supabase/admin"

export type SoftRestriction = {
  blocked: boolean
  reason: string | null
  verification_required: boolean
  verification_reason: string | null
}

/**
 * Check if a user has soft restrictions that should block high-risk actions
 * (withdrawals, payouts, Stripe changes). Called from API routes.
 */
export async function checkSoftRestrictions(userId: string): Promise<SoftRestriction> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_flagged, risk_score, risk_level, verification_required, verification_reason, withdrawal_locked, account_status, is_frozen, freeze_reason")
    .eq("id", userId)
    .single()

  if (!profile) {
    return { blocked: false, reason: null, verification_required: false, verification_reason: null }
  }

  // Hard block: account frozen by auto-freeze system
  if (profile.is_frozen) {
    return {
      blocked: true,
      reason: `Account frozen: ${profile.freeze_reason ?? "Suspicious activity detected"}. Contact support.`,
      verification_required: false,
      verification_reason: null,
    }
  }

  // Hard block: withdrawal locked or account suspended/closed
  if (profile.withdrawal_locked) {
    return {
      blocked: true,
      reason: "Withdrawals are temporarily locked on your account. Contact support.",
      verification_required: false,
      verification_reason: null,
    }
  }

  if (profile.account_status === "suspended" || profile.account_status === "closed") {
    return {
      blocked: true,
      reason: "Your account is " + profile.account_status + ". Contact support.",
      verification_required: false,
      verification_reason: null,
    }
  }

  // Soft block: verification required (score >= 90 trigger)
  if (profile.verification_required) {
    return {
      blocked: true,
      reason: "Additional verification is required before this action.",
      verification_required: true,
      verification_reason: profile.verification_reason,
    }
  }

  // Flagged users must verify before high-risk actions regardless of score
  if (profile.is_flagged) {
    return {
      blocked: true,
      reason: "Your account has been flagged for review. Additional verification is required.",
      verification_required: true,
      verification_reason: "admin_flag",
    }
  }

  return { blocked: false, reason: null, verification_required: false, verification_reason: null }
}
