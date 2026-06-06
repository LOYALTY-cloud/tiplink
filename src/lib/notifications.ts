import { supabaseAdmin } from "@/lib/supabase/admin";
import { emailFooter } from "@/lib/email/footer";
import { notificationTypeToCategory } from "@/lib/emailConfig";
import { sendEmailAsync } from "@/lib/emailService";

type NotificationType =
  | "tip"
  | "payout"
  | "payout_requested"
  | "payout_processing"
  | "payout_paid"
  | "payout_failed"
  | "verification_needed"
  | "theme_sold"
  | "theme_unlocked"
  | "theme_rejected"
  | "appeal_approved"
  | "appeal_rejected"
  | "creator_approved"
  | "security"
  | "support";

type NotificationCategory = "payouts" | "sales" | "tips" | "security" | "support" | "system";

function deriveCategory(type: NotificationType): NotificationCategory {
  if (type === "tip") return "tips";
  if (type === "payout" || type.startsWith("payout_")) return "payouts";
  if (type === "verification_needed") return "security";
  if (type === "theme_sold" || type === "theme_unlocked") return "sales";
  if (type === "creator_approved") return "system";
  if (type === "appeal_approved" || type === "appeal_rejected") return "system";
  if (type === "security") return "security";
  if (type === "support") return "support";
  return "system";
}

type SecurityAction =
  | "restricted_temp"
  | "restricted_permanent"
  | "suspended"
  | "closed"
  | "reactivated"
  | "password_changed"
  | "bulk_restricted"
  | "new_device_login"
  | "temp_unfreeze";

const DASHBOARD_URL = "https://1nelink.com/dashboard";
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://1nelink.com";

/**
 * Core notification engine.
 * 1. Checks user preferences
 * 2. Inserts DB row (feeds realtime)
 * 3. Sends branded email via Resend (non-blocking)
 */
export async function createNotification({
  userId,
  type,
  title,
  body,
  category,
  actorId,
  entityId,
  meta,
  skipEmail = false,
}: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  category?: NotificationCategory;
  actorId?: string;
  entityId?: string;
  skipEmail?: boolean;
  meta?: {
    amount?: number;
    fee?: number;
    net?: number;
    ticketId?: string;
    action?: SecurityAction;
    reason?: string;
    restrictedUntil?: string;
    payout_id?: string;
    failure_message?: string | null;
    freeze_level?: string;
    device?: string;
    ip?: string;
    expires_at?: string;
  };
}) {
  try {
    // 1. Get user email + settings in parallel
    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabaseAdmin.from("profiles").select("email").eq("user_id", userId).single(),
      supabaseAdmin.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    // Fallback: if profiles.email is null, pull from auth.users and sync it
    let email = profile?.email ?? null;
    if (!email) {
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authData?.user?.email) {
        email = authData.user.email;
        // Persist so future lookups don't need this fallback
        supabaseAdmin
          .from("profiles")
          .update({ email })
          .eq("user_id", userId)
          .then(() => {}, () => {});
      }
    }

    // Auto-create user_settings if missing (defaults: all notifications on)
    const prefs = settings ?? { notify_tips: true, notify_payouts: true, notify_security: true };
    if (!settings) {
      supabaseAdmin
        .from("user_settings")
        .upsert({ user_id: userId, notify_tips: true, notify_payouts: true, notify_security: true })
        .then(() => {}, () => {});
    }

    // 2. Check preferences
    const isPayoutType =
      type === "payout" ||
      type === "payout_requested" ||
      type === "payout_processing" ||
      type === "payout_paid" ||
      type === "payout_failed";

    const isThemeSalesType = type === "theme_sold" || type === "theme_unlocked";

    const allowed =
      (type === "tip" && prefs.notify_tips !== false) ||
      (isPayoutType && prefs.notify_payouts !== false) ||
      (type === "verification_needed" && prefs.notify_security !== false) ||
      (type === "security" && prefs.notify_security !== false) ||
      isThemeSalesType || // theme purchase notifications always sent
      type === "theme_rejected" || // rejection notifications always sent
      type === "appeal_approved" ||
      type === "appeal_rejected" ||
      type === "support"; // support notifications are always sent

    if (!allowed) return;

    // 3. Insert in-app notification (triggers realtime for subscribed clients)
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      category: category ?? deriveCategory(type),
      actor_id: actorId ?? null,
      entity_id: entityId ?? null,
      title,
      body,
    });

    // 4. Send branded email (non-blocking — won't break webhook)
    if (email && !skipEmail) {
      const html = buildEmailHtml({ type, title, body, meta });
      sendEmailAsync({
        type: "NOTIFICATION",
        to: email,
        subject: title,
        html,
        categoryOverride: notificationTypeToCategory(type),
      });
    }
  } catch (err) {
    console.error("Notification error:", err);
  }
}

/* ── Branded email templates per notification type ──────── */

function buildEmailHtml({
  type,
  title,
  body,
  meta,
}: {
  type: NotificationType;
  title: string;
  body: string;
  meta?: {
    amount?: number;
    fee?: number;
    net?: number;
    ticketId?: string;
    action?: SecurityAction;
    reason?: string;
    restrictedUntil?: string;
    payout_id?: string;
    failure_message?: string | null;
    freeze_level?: string;
  };
}): string {
  const inner = type === "tip"
    ? buildTipBlock(meta)
    : type === "payout" || type === "payout_paid" || type === "payout_requested" || type === "payout_processing"
      ? buildPayoutBlock(meta)
      : type === "payout_failed"
        ? buildPayoutFailedBlock(meta)
        : type === "security"
          ? buildSecurityBlock(body, meta)
          : type === "support"
            ? buildSupportBlock(body, meta)
            : type === "theme_sold"
              ? buildThemeSoldBlock(body, meta)
              : type === "theme_unlocked"
                ? buildThemeUnlockedBlock(body)
                : `<p style="margin:12px 0 0;color:#4b5563;">${body}</p>`;

  // Dynamic CTA per security action
  const securityCta = getSecurityCta(meta?.action);
  const ctaColor = type === "security" ? "#000000" : "#111827";
  const ctaLabel = type === "security"
    ? securityCta.label
    : type === "support"
      ? "View Ticket →"
      : "View Dashboard →";
  const ctaHref = type === "security"
    ? securityCta.href
    : type === "support" && meta?.ticketId
    ? `${DASHBOARD_URL}/support/tickets/${meta.ticketId}`
    : DASHBOARD_URL;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr><td align="center" style="padding:30px 20px 10px 20px;"><img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png" alt="1neLink" width="150" style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" /></td></tr><tr><td style="height:2px;background:linear-gradient(to right,#00E0FF,#7B3FE4);"></td></tr><tr><td height="10"></td></tr></table>
      <p style="margin:16px 0 8px;font-size:20px;color:${type === "security" ? "#dc2626" : "#111827"};font-weight:700;">${title}</p>
      ${inner}
      <a href="${ctaHref}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:${ctaColor};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        ${ctaLabel}
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You can manage notification preferences in your
        <a href="${DASHBOARD_URL}" style="color:#6b7280;">Settings</a>.
      </p>
      ${emailFooter()}
    </div>
  </div>`;
}

function buildTipBlock(meta?: { amount?: number; fee?: number; net?: number }): string {
  if (!meta?.amount) return "";
  const amount = meta.amount.toFixed(2);
  return `
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:12px 0;text-align:center;">
    <p style="margin:0;color:#166534;font-size:28px;font-weight:700;">$${amount}</p>
    <p style="margin:8px 0 0;color:#166534;font-size:14px;">received</p>
  </div>`;
}

function buildPayoutBlock(meta?: { amount?: number; fee?: number; net?: number }): string {
  const amount = (meta?.amount ?? 0).toFixed(2);
  const fee = meta?.fee ?? 0;
  const net = meta?.net ?? meta?.amount ?? 0;
  const showFee = fee > 0;

  return `
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:12px 0;text-align:center;">
    <p style="margin:0;color:#166534;font-size:28px;font-weight:700;">$${showFee ? net.toFixed(2) : amount}</p>
    <p style="margin:8px 0 0;color:#166534;font-size:14px;">sent to your bank account</p>
  </div>${showFee ? `
  <div style="margin:8px 0 0;font-size:13px;color:#6b7280;text-align:center;">
    <span>Withdrawal: $${amount}</span> · <span>Fee: $${fee.toFixed(2)}</span>
  </div>` : ""}
  <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;text-align:center;">Instant payouts typically arrive within minutes.</p>`;
}

function buildPayoutFailedBlock(meta?: { failure_message?: string | null }): string {
  return `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:12px 0;text-align:center;">
    <p style="margin:0;color:#991b1b;font-size:16px;font-weight:700;">Payout failed</p>
    <p style="margin:8px 0 0;color:#7f1d1d;font-size:14px;">
      ${meta?.failure_message ? meta.failure_message : "Something went wrong processing your withdrawal."}
    </p>
  </div>
  <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;text-align:center;">Please try again or contact support if the issue persists.</p>`;
}

/* ── Sanitize internal reason codes to user-friendly text ─ */

function formatReason(reason?: string): string {
  if (!reason) return "Unusual activity detected";
  const map: Record<string, string> = {
    rapid_activity: "Unusual rapid activity detected",
    card_spam: "Multiple payment attempts detected",
    refund_abuse: "Unusual refund activity detected",
    fraud: "Suspicious activity detected on your account",
    tos_violation: "Violation of our Terms of Service",
    user_request: "At your request",
    chargeback: "Chargeback dispute on your account",
    identity_mismatch: "Identity verification issue",
  };
  // Strip internal admin prefixes like "admin_action_by_..."
  if (reason.startsWith("admin_action_by_") || reason.startsWith("bulk_restrict_by_")) {
    return "Unusual activity detected";
  }
  return map[reason] || reason;
}

/* ── Dynamic CTA per security action ──────────────────── */

function getSecurityCta(action?: SecurityAction): { label: string; href: string } {
  switch (action) {
    case "restricted_temp":
    case "restricted_permanent":
    case "bulk_restricted":
      return { label: "View Account Status", href: `${APP_URL}/dashboard` };
    case "suspended":
      return { label: "Contact Support", href: `${APP_URL}/dashboard` };
    case "closed":
      return { label: "Go to Wallet", href: `${APP_URL}/dashboard` };
    case "reactivated":
      return { label: "Go to Dashboard", href: `${APP_URL}/dashboard` };
    case "password_changed":
      return { label: "View Account", href: `${APP_URL}/dashboard` };
    default:
      return { label: "View Account Status", href: `${APP_URL}/dashboard` };
  }
}

/* ── Security email block: action-specific templates ───── */

function buildSecurityBlock(
  fallbackBody: string,
  meta?: { action?: SecurityAction; reason?: string; restrictedUntil?: string },
): string {
  const reason = formatReason(meta?.reason);

  switch (meta?.action) {
    case "restricted_temp":
      return `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#991b1b;font-size:16px;">Temporary Restriction</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your account has been temporarily restricted to protect your activity.
        </p>
        <p style="margin:12px 0 0;color:#111;font-size:14px;">
          <strong>Reason:</strong> ${reason}
        </p>
        ${meta.restrictedUntil ? `
        <p style="margin:8px 0 0;color:#111;font-size:14px;">
          <strong>Duration:</strong> ${meta.restrictedUntil}
        </p>` : ""}
        <p style="margin:16px 0 0;color:#666;font-size:13px;">
          During this time, you won't be able to receive tips or withdraw funds.
          You can request a review from your dashboard or contact support@1nelink.com.
        </p>
      </div>`;

    case "restricted_permanent":
      return `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#991b1b;font-size:16px;">Account Under Review</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your account has been restricted for further review.
        </p>
        <p style="margin:12px 0 0;color:#111;font-size:14px;">
          <strong>Reason:</strong> ${reason}
        </p>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">
          You may need to verify your identity or provide additional information before access is restored.
          Contact support@1nelink.com if you have questions.
        </p>
      </div>`;

    case "suspended":
      return `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#991b1b;font-size:16px;">Account Suspended</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your account has been suspended due to a violation of our policies.
        </p>
        <p style="margin:12px 0 0;color:#111;font-size:14px;">
          <strong>Reason:</strong> ${reason}
        </p>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">
          If you believe this was a mistake, please contact support@1nelink.com for assistance.
        </p>
      </div>`;

    case "closed":
      return `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#111;font-size:16px;">Account Closed</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your account has been closed.
        </p>
        <p style="margin:12px 0 0;color:#111;font-size:14px;">
          <strong>Reason:</strong> ${reason}
        </p>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">
          If you have a remaining balance, you can still withdraw your funds from your wallet.
          For questions, contact support@1nelink.com.
        </p>
      </div>`;

    case "reactivated":
      return `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:12px 0;">
        <p style="margin:0;font-size:28px;text-align:center;">🎉</p>
        <h3 style="margin:8px 0;color:#166534;font-size:16px;text-align:center;">You're Back!</h3>
        <p style="margin:0;color:#444;font-size:14px;text-align:center;">
          Your account has been restored and is now fully active.
        </p>
        <p style="margin:12px 0 0;color:#666;font-size:13px;text-align:center;">
          You can now receive tips and withdraw funds as normal.
        </p>
      </div>`;

    case "password_changed":
      return `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#1e40af;font-size:16px;">Password Updated</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your 1neLink password was just changed successfully.
        </p>
        <p style="margin:16px 0 0;color:#991b1b;font-size:13px;font-weight:600;">
          If you did not make this change, reset your password immediately and contact support@1nelink.com.
        </p>
      </div>`;

    case "bulk_restricted":
      return `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <h3 style="margin:0 0 8px;color:#991b1b;font-size:16px;">Account Activity Notice</h3>
        <p style="margin:0;color:#444;font-size:14px;">
          Your account has been temporarily restricted due to unusual activity.
        </p>
        <p style="margin:12px 0 0;color:#111;font-size:14px;">
          <strong>Reason:</strong> ${reason}
        </p>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">
          If this was unexpected, you can request a review from your dashboard or contact support@1nelink.com.
        </p>
      </div>`;

    default:
      // Fallback for generic security messages (e.g. from other callers)
      return `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin:12px 0;">
        <p style="margin:0;color:#991b1b;">${fallbackBody}</p>
      </div>
      <p style="margin:4px 0 0;color:#991b1b;font-size:13px;font-weight:600;">If this wasn't you, change your password immediately.</p>`;
  }
}

function buildSupportBlock(message: string, meta?: { ticketId?: string }): string {
  return `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:12px 0;">
    <p style="margin:0;color:#1e40af;">${message}</p>
    ${meta?.ticketId ? `<p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Ticket #${meta.ticketId.slice(0, 8)}</p>` : ""}
  </div>`;
}

function buildThemeSoldBlock(body: string, meta?: { amount?: number }): string {
  return `
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:12px 0;text-align:center;">
    <p style="margin:0;font-size:32px;">🎨</p>
    <p style="margin:8px 0 0;color:#166534;font-size:14px;font-weight:600;">${body}</p>
    ${meta?.amount ? `<p style="margin:8px 0 0;color:#166534;font-size:22px;font-weight:700;">+$${meta.amount.toFixed(2)}</p><p style="margin:4px 0 0;color:#6b7280;font-size:12px;">added to your earnings</p>` : ""}
  </div>`;
}

function buildThemeUnlockedBlock(body: string): string {
  return `
  <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin:12px 0;text-align:center;">
    <p style="margin:0;font-size:32px;">🎉</p>
    <p style="margin:8px 0 0;color:#6b21a8;font-size:14px;font-weight:600;">${body}</p>
    <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Head to My Themes to apply it to your page.</p>
  </div>`;
}

/**
 * Notify all admins with restrict+ permission (owner, super_admin).
 * Sends a security notification to each.
 */
export async function notifyAdmins({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  try {
    const { data: admins } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .in("role", ["owner", "super_admin"]);

    if (!admins?.length) return;

    await Promise.allSettled(
      admins.map((a) =>
        createNotification({
          userId: a.user_id,
          type: "security",
          title,
          body,
        })
      )
    );
  } catch (err) {
    console.error("notifyAdmins error:", err);
  }
}
