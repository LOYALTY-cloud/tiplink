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
      // Email 1 — light warning
      sendEmailAsync({
        type: "MARKETPLACE_STRIKE",
        to: creatorData.email,
        subject: "Heads up: Your theme was removed from the Theme Store",
        html: `<p>Hi ${creatorData.display_name ?? "Creator"},</p>
<p>One of your themes has been removed from the 1neLink Theme Store for the following reason:</p>
<blockquote>${reason}</blockquote>
<p>This is your <strong>first notice</strong>. Please review our <a href="https://1nelink.com/legal">content guidelines</a> to make sure future themes stay within our policies.</p>
<p>No action is required right now — just take a moment to review what happened.</p>
<p>— The 1neLink Team</p>`,
      });

      // Email 2 — heavier follow-up making the consequences clear
      sendEmailAsync({
        type: "MARKETPLACE_STRIKE",
        to: creatorData.email,
        subject: "Important: Further violations will suspend your Theme Store access",
        html: `<p>Hi ${creatorData.display_name ?? "Creator"},</p>
<p>Following the removal of your recent theme, we want to make sure you understand what happens if another violation occurs:</p>
<ul>
  <li><strong>Next violation:</strong> Your Theme Store and Theme Builder access will be suspended for <strong>30 days</strong>.</li>
  <li><strong>Third violation:</strong> Your account will be <strong>permanently banned</strong> from the Theme Store.</li>
</ul>
<p>If you believe the removal was a mistake, you can submit an appeal from your creator dashboard.</p>
<p>We value your contributions to the Theme Store and want to keep you here — please keep your uploads in line with our guidelines.</p>
<p>— The 1neLink Team</p>`,
      });
    } else if (strikes === 2) {
      sendEmailAsync({
        type: "MARKETPLACE_STRIKE",
        to: creatorData.email,
        subject: "Your Theme Store access has been suspended for 30 days",
        html: `<p>Hi ${creatorData.display_name ?? "Creator"},</p>
<p>Your theme has been removed and you have reached <strong>strike 2 of 3</strong>.</p>
<p>Reason: <em>${reason}</em></p>
<p>As a result, your <strong>Theme Store and Theme Builder access is suspended for 30 days</strong>. You will not be able to upload new themes during this period.</p>
<p>One more violation will result in a <strong>permanent ban</strong> from the Theme Store.</p>
<p>If you believe this was a mistake, you can appeal via your creator dashboard.</p>
<p>— The 1neLink Team</p>`,
      });
    } else if (strikes >= 3) {
      sendEmailAsync({
        type: "MARKETPLACE_STRIKE",
        to: creatorData.email,
        subject: "Your account has been permanently banned from the Theme Store",
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
