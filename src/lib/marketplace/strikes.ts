import { supabaseAdmin } from "@/lib/supabase/admin";
import { determineCreatorBadge, calculateTrustScore } from "./trustScore";
import { sendEmailAsync } from "@/lib/emailService";

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
    // Permanent upload ban — set far-future date so upload_ban_until > now() check works
    // (null = no ban, so we use year 9999 as "permanent")
    update.upload_ban_until = "9999-12-31T23:59:59Z";
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

  // Send warning email to the creator (non-blocking)
  const { data: creatorData } = await supabaseAdmin
    .from("profiles")
    .select("email, display_name")
    .eq("user_id", creatorId)
    .maybeSingle();

  if (creatorData?.email) {
    if (strikes === 1) {
      sendEmailAsync({
        type: "MARKETPLACE_STRIKE",
        to: creatorData.email,
        subject: "Warning: Your theme was removed from the Theme Store",
        html: `<p>Hi ${creatorData.display_name ?? "Creator"},</p>
<p>Your theme has been removed from the 1neLink Theme Store for the following reason:</p>
<blockquote>${reason}</blockquote>
<p>This is strike <strong>1 of 3</strong>. Two more strikes will result in a permanent ban from the Theme Store.</p>
<p>If you believe this was a mistake, you can appeal via your creator dashboard.</p>
<p>— The 1neLink Team</p>`,
      });
    } else if (strikes === 2) {
      sendEmailAsync({
        type: "MARKETPLACE_STRIKE",
        to: creatorData.email,
        subject: "Final Warning: 30-day Theme Store upload suspension",
        html: `<p>Hi ${creatorData.display_name ?? "Creator"},</p>
<p>Your theme has been removed and you have received strike <strong>2 of 3</strong>.</p>
<p>Reason: <em>${reason}</em></p>
<p>You are now suspended from uploading to the Theme Store for <strong>30 days</strong>. One more violation will result in a permanent ban.</p>
<p>To appeal, visit your creator dashboard.</p>
<p>— The 1neLink Team</p>`,
      });
    } else if (strikes >= 3) {
      sendEmailAsync({
        type: "MARKETPLACE_STRIKE",
        to: creatorData.email,
        subject: "Account banned from the Theme Store",
        html: `<p>Hi ${creatorData.display_name ?? "Creator"},</p>
<p>Due to repeated violations, your account has been <strong>permanently banned</strong> from the 1neLink Theme Store.</p>
<p>Reason for final strike: <em>${reason}</em></p>
<p>All of your themes have been removed. If you believe this is an error, please contact support.</p>
<p>— The 1neLink Team</p>`,
      });
    }
  }

  return { strikes };
}
