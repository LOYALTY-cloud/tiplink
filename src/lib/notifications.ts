import { supabaseAdmin } from "@/lib/supabase/admin";
import { resend } from "@/lib/email";

type NotificationType = "tip" | "payout" | "security";

const DASHBOARD_URL = "https://tiplinkme.com/dashboard";

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
  meta,
}: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  meta?: { amount?: number; fee?: number; net?: number };
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
          .then(() => {})
          .catch(() => {});
      }
    }

    // Auto-create user_settings if missing (defaults: all notifications on)
    const prefs = settings ?? { notify_tips: true, notify_payouts: true, notify_security: true };
    if (!settings) {
      supabaseAdmin
        .from("user_settings")
        .upsert({ user_id: userId, notify_tips: true, notify_payouts: true, notify_security: true })
        .then(() => {})
        .catch(() => {});
    }

    // 2. Check preferences
    const allowed =
      (type === "tip" && prefs.notify_tips !== false) ||
      (type === "payout" && prefs.notify_payouts !== false) ||
      (type === "security" && prefs.notify_security !== false);

    if (!allowed) return;

    // 3. Insert in-app notification (triggers realtime for subscribed clients)
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body,
    });

    // 4. Send branded email (non-blocking — won't break webhook)
    if (email) {
      const html = buildEmailHtml({ type, title, body, meta });
      resend.emails
        .send({
          from: process.env.EMAIL_FROM!,
          to: email,
          subject: title,
          html,
        })
        .catch((err) => {
          console.error("Email send failed:", err);
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
  meta?: { amount?: number; fee?: number; net?: number };
}): string {
  const inner = type === "tip"
    ? buildTipBlock(meta)
    : type === "payout"
      ? buildPayoutBlock(meta)
      : type === "security"
        ? buildSecurityBlock(body)
        : `<p style="margin:12px 0 0;color:#4b5563;">${body}</p>`;

  const ctaColor = type === "security" ? "#dc2626" : "#111827";
  const ctaLabel = type === "security" ? "Review Account →" : "View Dashboard →";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h2 style="margin:0;color:#111827;">TIPLINKME</h2>
      <p style="margin:16px 0 8px;font-size:20px;color:${type === "security" ? "#dc2626" : "#111827"};font-weight:700;">${title}</p>
      ${inner}
      <a href="${DASHBOARD_URL}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:${ctaColor};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
        ${ctaLabel}
      </a>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You can manage notification preferences in your
        <a href="${DASHBOARD_URL}" style="color:#6b7280;">Settings</a>.
      </p>
    </div>
  </div>`;
}

function buildTipBlock(meta?: { amount?: number; fee?: number; net?: number }): string {
  if (!meta?.amount) return "";
  const amount = meta.amount.toFixed(2);
  const fee = (meta.fee ?? 0).toFixed(2);
  const net = (meta.net ?? meta.amount).toFixed(2);
  return `
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">
    <p style="margin:0;color:#111827;"><strong>Amount:</strong> $${amount}</p>
    <p style="margin:8px 0 0;color:#111827;"><strong>Fee:</strong> $${fee}</p>
    <p style="margin:8px 0 0;color:#111827;font-weight:700;"><strong>You receive:</strong> $${net}</p>
  </div>`;
}

function buildPayoutBlock(meta?: { amount?: number; fee?: number; net?: number }): string {
  const amount = (meta?.amount ?? 0).toFixed(2);
  return `
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:12px 0;">
    <p style="margin:0;color:#166534;font-size:18px;font-weight:700;">$${amount}</p>
    <p style="margin:8px 0 0;color:#166534;">has been sent to your bank account</p>
  </div>
  <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">Payouts typically arrive within 1-2 business days.</p>`;
}

function buildSecurityBlock(message: string): string {
  return `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:12px 0;">
    <p style="margin:0;color:#991b1b;">${message}</p>
  </div>
  <p style="margin:4px 0 0;color:#991b1b;font-size:13px;font-weight:600;">If this wasn't you, change your password immediately.</p>`;
}
