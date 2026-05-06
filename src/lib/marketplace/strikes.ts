import { supabaseAdmin } from "@/lib/supabase/admin";
import { determineCreatorBadge, calculateTrustScore } from "./trustScore";

export const REPORT_REASONS = [
  "Copyright infringement",
  "Trademark/logo misuse",
  "Stolen content",
  "Scam/malware",
  "NSFW",
  "Spam",
] as const;

export type ReportReason = typeof REPORT_REASONS[number];

/**
 * Issue a strike to a creator.
 * - Inserts into creator_strikes
 * - Flags the theme as removed
 * - Updates creator_marketplace_profiles: active_strikes, badge, trust_score
 * - On 3+ active strikes: sets permanent upload ban
 */
export async function applyStrike(
  creatorId: string,
  themeId: string,
  reason: string,
): Promise<{ strikes: number }> {
  // 1. Insert the strike
  await supabaseAdmin.from("creator_strikes").insert({
    creator_id: creatorId,
    theme_id: themeId,
    reason,
  });

  // 2. Flag the theme as removed
  await supabaseAdmin
    .from("themes")
    .update({ status: "removed", moderation_reason: reason })
    .eq("id", themeId);

  // 3. Count active strikes
  const { count } = await supabaseAdmin
    .from("creator_strikes")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

  const strikes = count ?? 0;

  // 4. Recalculate badge + update profile
  const { data: profile } = await supabaseAdmin
    .from("creator_marketplace_profiles")
    .select("total_sales, total_reports, verified_identity, created_at")
    .eq("user_id", creatorId)
    .maybeSingle();

  const accountAgeDays = profile
    ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86_400_000)
    : 0;

  const trust = calculateTrustScore({
    sales: profile?.total_sales ?? 0,
    refunds: 0,
    reports: (profile?.total_reports ?? 0) + 1,
    strikes,
    accountAge: accountAgeDays,
  });

  const badge = determineCreatorBadge({
    sales: profile?.total_sales ?? 0,
    strikes,
    verified: profile?.verified_identity ?? false,
    trust,
  });

  const update: Record<string, unknown> = {
    active_strikes: strikes,
    trust_score: Math.round(trust),
    creator_badge: badge,
  };

  if (strikes >= 3) {
    // Permanent upload ban
    update.upload_ban_until = null;
    // Mark all of their themes as banned_creator
    await supabaseAdmin
      .from("themes")
      .update({ status: "banned_creator" })
      .eq("user_id", creatorId)
      .in("status", ["draft", "pending_review", "approved"]);
  } else if (strikes === 2) {
    // 30-day upload suspension
    const banUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    update.upload_ban_until = banUntil;
  }

  await supabaseAdmin
    .from("creator_marketplace_profiles")
    .upsert({ user_id: creatorId, ...update }, { onConflict: "user_id" });

  return { strikes };
}
