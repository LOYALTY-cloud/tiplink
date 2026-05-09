import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmailAsync } from "@/lib/emailService";

const EMAIL_CHANGE_LOCK_MS = 14 * 24 * 60 * 60 * 1000;

function buildEmailChangedAlertHtml(oldEmail: string, newEmail: string, changedAt: Date): string {
  const dashboardUrl = "https://1nelink.com/dashboard/account";
  const supportUrl = "https://1nelink.com/support";
  const dateStr = changedAt.toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #060B18; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #0f172a; border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.08);">

    <!-- Header -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 28px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">Email Address Changed</div>
      <div style="width: 48px; height: 3px; background: linear-gradient(90deg, #f59e0b, #ef4444); border-radius: 2px;"></div>
    </div>

    <!-- Warning -->
    <div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; color: #fde68a; font-size: 14px; line-height: 1.6;">
        ⚠️ This is a security notification. Your 1neLink account email was changed on <strong>${dateStr}</strong>.
      </p>
    </div>

    <!-- Change summary -->
    <p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Change Summary</p>
    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <div style="margin-bottom: 10px;">
        <span style="color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Previous email</span>
        <div style="color: #e5e7eb; font-size: 14px; margin-top: 4px;">${oldEmail}</div>
      </div>
      <div>
        <span style="color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">New email</span>
        <div style="color: #e5e7eb; font-size: 14px; margin-top: 4px;">${newEmail}</div>
      </div>
    </div>

    <!-- CTA if not them -->
    <p style="margin: 0 0 20px; color: #d1d5db; font-size: 14px; line-height: 1.6;">
      If you made this change, no action is needed. If you did <strong style="color: #f87171;">not</strong> make this change, please contact support immediately.
    </p>

    <a href="${supportUrl}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(90deg, #f59e0b, #ef4444); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
      Contact Support →
    </a>

    <!-- Footer -->
    <hr style="margin: 28px 0; border: none; border-top: 1px solid rgba(255,255,255,0.08);" />
    <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">
      You can review your account settings at any time at <a href="${dashboardUrl}" style="color: #60a5fa; text-decoration: none;">1nelink.com/dashboard/account</a>.
      This notification was sent to your previous email address as a security measure.
    </p>

  </div>
</div>
  `.trim();
}

function buildEmailChangedConfirmationHtml(newEmail: string): string {
  const dashboardUrl = "https://1nelink.com/dashboard/account";

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #060B18; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #0f172a; border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.08);">

    <!-- Header -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 28px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">Verify Your New Email</div>
      <div style="width: 48px; height: 3px; background: linear-gradient(90deg, #3b82f6, #06b6d4); border-radius: 2px;"></div>
    </div>

    <!-- Main message -->
    <p style="margin: 0 0 24px; color: #e5e7eb; font-size: 15px; line-height: 1.6;">
      Your 1neLink account email has been updated to <strong style="color: #60a5fa;">${newEmail}</strong>.
      Please verify this address to ensure uninterrupted access to your account.
    </p>

    <!-- Info box -->
    <div style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; color: #93c5fd; font-size: 14px; line-height: 1.6;">
        📬 Check your inbox for a separate verification link from 1neLink/Supabase and click it to confirm this email address.
      </p>
    </div>

    <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(90deg, #3b82f6, #06b6d4); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
      Go to Account Settings →
    </a>

    <!-- Footer -->
    <hr style="margin: 28px 0; border: none; border-top: 1px solid rgba(255,255,255,0.08);" />
    <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">
      If you didn't request this change, please contact our support team immediately. Email changes are locked for 2 weeks after each update.
    </p>

  </div>
</div>
  `.trim();
}

export async function POST(req: Request) {
  try {
    let authUser: { user: { id: string; email?: string | null; app_metadata?: unknown } } | null = null;

    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

    if (bearerToken) {
      const { data, error } = await supabaseAdmin.auth.getUser(bearerToken);
      if (!error && data?.user) {
        authUser = { user: data.user };
      }
    }

    if (!authUser) {
      const supabase = await createSupabaseRouteClient();
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        authUser = { user: data.user };
      }
    }

    if (!authUser?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = authUser.user.id;
    const userEmail = authUser.user.email;
    const existingAppMetadata = (authUser.user.app_metadata ?? {}) as Record<string, unknown>;
    const emailChangeLockedUntil = typeof existingAppMetadata.email_change_locked_until === "string"
      ? existingAppMetadata.email_change_locked_until
      : null;

    if (emailChangeLockedUntil) {
      const lockEnd = new Date(emailChangeLockedUntil);
      if (lockEnd.getTime() > Date.now()) {
        const daysLeft = Math.ceil((lockEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return NextResponse.json(
          {
            error: `You can change your email again in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
            lockedUntil: lockEnd.toISOString(),
          },
          { status: 403 }
        );
      }
    }

    // Parse request body
    const { newEmail, password } = await req.json();

    if (!newEmail || !password) {
      return NextResponse.json(
        { error: "New email and password are required" },
        { status: 400 }
      );
    }

    // Validate new email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    if (newEmail.toLowerCase() === (userEmail || "").toLowerCase()) {
      return NextResponse.json(
        { error: "New email must be different from your current email" },
        { status: 400 }
      );
    }

    // Verify password using a separate anon client so we don't mutate the current session
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { error: signInErr } = await verifyClient.auth.signInWithPassword({
      email: userEmail || "",
      password,
    });

    if (signInErr) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    // Check if new email is already in use
    const { data: listedUsers, error: listUsersErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listUsersErr) {
      return NextResponse.json(
        { error: "Failed to validate email availability" },
        { status: 500 }
      );
    }

    const existingUser = listedUsers.users.find(
      (user) => user.email?.toLowerCase() === newEmail.toLowerCase() && user.id !== userId
    );

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }

    const nextLockedUntil = new Date(Date.now() + EMAIL_CHANGE_LOCK_MS).toISOString();

    // Update email in auth
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        email: newEmail,
        email_confirm: false,
        app_metadata: {
          ...existingAppMetadata,
          email_change_locked_until: nextLockedUntil,
        },
      }
    );

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update email: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // Update email in profiles table
    await supabaseAdmin
      .from("profiles")
      .update({ email: newEmail })
      .eq("user_id", userId);

    // Fire notification emails — non-blocking
    const changedAt = new Date();
    if (userEmail) {
      // Security alert to OLD address
      sendEmailAsync({
        type: "EMAIL_CHANGED_ALERT",
        to: userEmail,
        subject: "Your 1neLink email address was changed",
        html: buildEmailChangedAlertHtml(userEmail, newEmail, changedAt),
      });
    }
    // Verification nudge to NEW address
    sendEmailAsync({
      type: "EMAIL_CHANGED_CONFIRMATION",
      to: newEmail,
      subject: "Verify your new 1neLink email address",
      html: buildEmailChangedConfirmationHtml(newEmail),
    });

    return NextResponse.json({
      success: true,
      message: "Email changed successfully. Please verify your new email address.",
      newEmail,
      lockedUntil: nextLockedUntil,
    });
  } catch (err) {
    console.error("Email change error:", err);
    return NextResponse.json(
      { error: "Failed to change email" },
      { status: 500 }
    );
  }
}
