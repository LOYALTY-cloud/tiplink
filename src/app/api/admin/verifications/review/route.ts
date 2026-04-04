import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { createNotification, notifyAdmins } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "restrict");

    const { id, action, reason } = await req.json();

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing verification id" }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Action must be approve or reject" }, { status: 400 });
    }
    if (action === "reject" && (!reason || !String(reason).trim())) {
      return NextResponse.json({ error: "Rejection requires a reason" }, { status: 400 });
    }

    // Load the verification (include match_score for audit)
    const { data: verification, error: fetchErr } = await supabaseAdmin
      .from("identity_verifications")
      .select("id, user_id, status, match_score")
      .eq("id", id)
      .single();

    if (fetchErr || !verification) {
      return NextResponse.json({ error: "Verification not found" }, { status: 404 });
    }
    if (verification.status !== "pending") {
      return NextResponse.json({ error: "Already reviewed" }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === "approve") {
      // Update verification record
      await supabaseAdmin
        .from("identity_verifications")
        .update({
          status: "approved",
          reviewed_at: now,
          reviewed_by: session.userId,
        })
        .eq("id", id);

      // Restore account → active, clear restriction, set verified badge
      await supabaseAdmin
        .from("profiles")
        .update({
          account_status: "active",
          kyc_status: "approved",
          is_verified: true,
          status_reason: null,
          restricted_until: null,
        })
        .eq("user_id", verification.user_id);

      // Notify user
      createNotification({
        userId: verification.user_id,
        type: "security",
        title: "Identity Verified ✔",
        body: "Your identity has been verified and your account is now fully active. You can withdraw and receive tips again.",
      }).catch(() => {});

      // Log admin action with match score
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: session.userId,
        action: "kyc_approved",
        target_user: verification.user_id,
        metadata: { verification_id: id, match_score: verification.match_score },
        severity: "info",
      });
    }

    if (action === "reject") {
      const trimmedReason = String(reason).slice(0, 500);

      // Update verification record
      await supabaseAdmin
        .from("identity_verifications")
        .update({
          status: "rejected",
          is_active: false,
          rejection_reason: trimmedReason,
          reviewed_at: now,
          reviewed_by: session.userId,
        })
        .eq("id", id);

      // Auto restrict account on failed verification + bump restriction count
      await supabaseAdmin.rpc("increment_restriction_count", { uid: verification.user_id }).then(() => {}, () => {});
      await supabaseAdmin
        .from("profiles")
        .update({
          kyc_status: "rejected",
          account_status: "restricted",
          status_reason: `Verification failed: ${trimmedReason}`,
        })
        .eq("user_id", verification.user_id);

      // Notify user
      createNotification({
        userId: verification.user_id,
        type: "security",
        title: "Verification Not Approved",
        body: `Your identity verification was not approved: ${trimmedReason}. You can submit a new document from your Account page.`,
      }).catch(() => {});

      // Log admin action
      await supabaseAdmin.from("admin_actions").insert({
        admin_id: session.userId,
        action: "kyc_rejected",
        target_user: verification.user_id,
        metadata: { verification_id: id, reason: trimmedReason, match_score: verification.match_score },
        severity: "info",
      });
    }

    return NextResponse.json({ ok: true, action });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
