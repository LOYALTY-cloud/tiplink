import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { sendEmailAsync } from "@/lib/emailService";
import { eliteCreatorApprovedHtml, eliteCreatorRejectedHtml } from "@/lib/email/eliteCreatorEmails";

export const runtime = "nodejs";

type ReviewBody = {
  id?: string;
  status?: "approved" | "rejected";
};

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function generateSetupToken(payload: { uid: string; email: string; exp: number }): string {
  const secret =
    process.env.SET_PASSWORD_LINK_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev_only_fallback_secret";

  const data = b64url(JSON.stringify({ ...payload, purpose: "elite_creator_set_password" }));
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, ["owner", "super_admin"]);

    let body: ReviewBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const id = body.id;
    const status = body.status;

    if (!id || (status !== "approved" && status !== "rejected")) {
      return NextResponse.json({ error: "id and valid status are required" }, { status: 400 });
    }

    const { data: app, error: appErr } = await supabaseAdmin
      .from("elite_creator_applications")
      .select("id, user_id, status, name, email, display_name, handle")
      .eq("id", id)
      .maybeSingle();

    if (appErr || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("elite_creator_applications")
      .update({
        status,
        reviewed_by: session.userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", id);

    if (updateErr) {
      console.error("admin/creators/review update app:", updateErr);
      return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
    }

    const recipientEmail = (app as { email?: string | null }).email;
    const recipientName = (app as { name?: string | null }).name ?? "";
    const displayName = (app as { display_name?: string | null }).display_name ?? recipientName;
    const handle = (app as { handle?: string | null }).handle ?? "";
    const existingUserId = (app as { user_id?: string | null }).user_id;

    if (status === "approved") {
      let targetUserId = existingUserId;
      let setPasswordLink: string | undefined;

      // If no account exists yet, create one now.
      if (!targetUserId && recipientEmail) {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: recipientEmail,
          email_confirm: true,
        });

        if (createErr || !newUser?.user) {
          console.error("admin/creators/review createUser:", createErr);
          return NextResponse.json({ error: "Application saved but account creation failed" }, { status: 500 });
        }

        targetUserId = newUser.user.id;

        // Link the application to the new user.
        await supabaseAdmin
          .from("elite_creator_applications")
          .update({ user_id: targetUserId })
          .eq("id", id);

        // Generate a signed set-password link that maps to this exact user.
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://1nelink.app";
        const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24h
        const setupToken = generateSetupToken({ uid: targetUserId, email: recipientEmail, exp });
        setPasswordLink = `${siteUrl}/set-password?setup_token=${encodeURIComponent(setupToken)}`;

        // Some environments auto-create a profile row on auth user creation.
        // Upsert avoids duplicate-key failures while still setting creator fields.
        const { error: profileUpsertErr } = await supabaseAdmin
          .from("profiles")
          .upsert({
            user_id: targetUserId,
            email: recipientEmail,
            display_name: displayName,
            handle: handle || null,
            is_creator: true,
            role: "user",
          }, { onConflict: "user_id" });

        if (profileUpsertErr) {
          console.error("admin/creators/review upsert profile:", profileUpsertErr);
          return NextResponse.json({ error: "Account created but profile setup failed" }, { status: 500 });
        }
      } else if (targetUserId) {
        // Existing account — just unlock creator access.
        const { error: profileErr } = await supabaseAdmin
          .from("profiles")
          .update({ is_creator: true })
          .eq("user_id", targetUserId);

        if (profileErr) {
          console.error("admin/creators/review update profile:", profileErr);
          return NextResponse.json({ error: "Application saved but profile unlock failed" }, { status: 500 });
        }
      }

      if (recipientEmail) {
        sendEmailAsync({
          type: "ELITE_CREATOR_APPROVED",
          to: recipientEmail,
          subject: "You're now a 1neLink Elite Creator 🎉",
          html: eliteCreatorApprovedHtml(recipientName, setPasswordLink),
        });
      }
    } else if (status === "rejected" && recipientEmail) {
      sendEmailAsync({
        type: "ELITE_CREATOR_REJECTED",
        to: recipientEmail,
        subject: "Update on your 1neLink Elite Creator application",
        html: eliteCreatorRejectedHtml(recipientName),
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("admin/creators/review POST:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}