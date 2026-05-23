import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { stripeFieldLabel } from "@/lib/stripe/fieldLabels";
import { sendEmail } from "@/lib/emailService";
import { emailFooter } from "@/lib/email/footer";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://1nelink.com";

const MAX_REMINDERS = 2;
const COOLDOWN_MS = 72 * 60 * 60 * 1000; // 72 hours

function sanitize(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildReminderEmail({
  handle,
  currentlyDue,
  pastDue,
  onboardingUrl,
  reminderNumber,
}: {
  handle: string | null;
  currentlyDue: string[];
  pastDue: string[];
  onboardingUrl: string;
  reminderNumber: number;
}): string {
  const greeting = handle ? `Hi @${sanitize(handle)},` : "Hi there,";
  const isUrgent = pastDue.length > 0;

  const currentlyDueRows = currentlyDue
    .map(
      (f) =>
        `<li style="margin:4px 0;color:#fbbf24;font-size:14px;">⚠️ ${sanitize(stripeFieldLabel(f))}</li>`
    )
    .join("");

  const pastDueRows = pastDue
    .map(
      (f) =>
        `<li style="margin:4px 0;color:#f87171;font-size:14px;">🔴 ${sanitize(stripeFieldLabel(f))}</li>`
    )
    .join("");

  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr>
        <td align="center" style="padding:20px 20px 10px 20px;">
          <img src="https://raw.githubusercontent.com/LOYALTY-cloud/tiplink/main/public/1nelink-logo.png"
               alt="1neLink" width="150"
               style="display:block;width:150px;max-width:180px;height:auto;border-radius:14px;" />
        </td>
      </tr>
      <tr><td style="height:2px;background:linear-gradient(to right,#f59e0b,#ef4444);"></td></tr>
      <tr><td height="10"></td></tr>
    </table>

    <p style="margin:16px 0 8px;font-size:20px;color:${isUrgent ? "#dc2626" : "#d97706"};font-weight:700;">
      ${isUrgent ? "🚨 Action required — Stripe account restricted" : "⚠️ Action required — Complete your Stripe verification"}
    </p>

    <p style="margin:0 0 12px;color:#444;font-size:14px;">${greeting}</p>

    <p style="margin:0 0 16px;color:#444;font-size:14px;">
      Your 1neLink payout account has outstanding verification requirements that need to be completed
      ${isUrgent ? "<strong>immediately to restore your payouts</strong>" : "to keep your payouts running smoothly"}.
      ${reminderNumber === 2 ? " <strong>This is our final reminder.</strong>" : ""}
    </p>

    ${
      currentlyDue.length > 0
        ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin:12px 0;">
             <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e;">Currently Due</p>
             <ul style="margin:0;padding-left:20px;">${currentlyDueRows}</ul>
           </div>`
        : ""
    }

    ${
      pastDue.length > 0
        ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:12px 0;">
             <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#991b1b;">Past Due — Payouts Paused</p>
             <ul style="margin:0;padding-left:20px;">${pastDueRows}</ul>
           </div>`
        : ""
    }

    <p style="margin:16px 0 8px;color:#444;font-size:14px;">
      Click the button below to open Stripe's secure verification portal and complete the required steps:
    </p>

    <div style="text-align:center;margin:24px 0;">
      <a href="${sanitize(onboardingUrl)}"
         style="display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;">
        Complete Verification →
      </a>
    </div>

    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
      This link expires in 24 hours. If it has expired, log in to your 1neLink dashboard and navigate to
      <a href="${APP_URL}/dashboard/account" style="color:#2563eb;">Account Settings</a> to generate a new one.
    </p>

    ${emailFooter()}
  </div>
</div>`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;

  // Load profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "email, handle, display_name, stripe_account_id, stripe_currently_due, stripe_past_due, stripe_reminder_sent_count, stripe_reminder_last_sent_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!profile.stripe_account_id) {
    return NextResponse.json({ error: "User has no Stripe account connected" }, { status: 400 });
  }

  if (!profile.email) {
    return NextResponse.json({ error: "User has no email address on file" }, { status: 400 });
  }

  const sentCount = profile.stripe_reminder_sent_count ?? 0;
  const lastSentAt = profile.stripe_reminder_last_sent_at
    ? new Date(profile.stripe_reminder_last_sent_at).getTime()
    : null;

  // Enforce max 2 reminders
  if (sentCount >= MAX_REMINDERS) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_REMINDERS} reminders already sent to this user` },
      { status: 409 }
    );
  }

  // Enforce 72h cooldown between sends
  if (lastSentAt && Date.now() - lastSentAt < COOLDOWN_MS) {
    const nextAllowedAt = new Date(lastSentAt + COOLDOWN_MS);
    return NextResponse.json(
      {
        error: `Must wait 72 hours between reminders. Next allowed: ${nextAllowedAt.toUTCString()}`,
        next_allowed_at: nextAllowedAt.toISOString(),
      },
      { status: 429 }
    );
  }

  // Generate Stripe account link for re-onboarding
  let onboardingUrl: string;
  try {
    const { stripe } = await import("@/lib/stripe/server");
    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_account_id as string,
      refresh_url: `${APP_URL}/dashboard/account`,
      return_url: `${APP_URL}/dashboard/account?stripe_return=1`,
      type: "account_onboarding",
    });
    onboardingUrl = accountLink.url;
  } catch (err) {
    console.error("[stripe-reminder] Failed to create account link:", err);
    return NextResponse.json(
      { error: "Failed to generate Stripe verification link" },
      { status: 500 }
    );
  }

  const currentlyDue = (profile.stripe_currently_due as string[] | null) ?? [];
  const pastDue = (profile.stripe_past_due as string[] | null) ?? [];
  const reminderNumber = sentCount + 1;

  const html = buildReminderEmail({
    handle: profile.handle as string | null,
    currentlyDue,
    pastDue,
    onboardingUrl,
    reminderNumber,
  });

  const subject =
    reminderNumber === 2
      ? "Final reminder: Complete your Stripe verification to restore payouts"
      : "Action required: Complete your Stripe verification on 1neLink";

  const { success, error: emailError } = await sendEmail({
    type: "STRIPE_VERIFICATION_REMINDER",
    to: profile.email as string,
    subject,
    html,
    categoryOverride: "security",
  });

  if (!success) {
    console.error("[stripe-reminder] Email send failed:", emailError);
    return NextResponse.json({ error: `Email failed: ${emailError}` }, { status: 500 });
  }

  // Record the send
  await supabaseAdmin
    .from("profiles")
    .update({
      stripe_reminder_sent_count: sentCount + 1,
      stripe_reminder_last_sent_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return NextResponse.json({
    success: true,
    reminder_number: reminderNumber,
    reminders_remaining: MAX_REMINDERS - reminderNumber,
    sent_to: profile.email,
  });
}
