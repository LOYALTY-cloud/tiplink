import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addLedgerEntry } from "@/lib/ledger";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { createNotification, notifyAdmins } from "@/lib/notifications";

export const runtime = "nodejs";

const ALLOWED_REASONS = ["fraud", "user_request", "tos_violation"] as const;

export async function POST(req: Request) {
  try {
    // 1. Authenticate caller and verify admin role
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    requireRole(session.role, "close");
    const adminId = session.userId;

    // 2. Parse and validate body
    const body = await req.json();
    const { user_id, reason } = body;
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

    // 3. Prevent admin self-lockout
    if (user_id === adminId) {
      return NextResponse.json({ error: "Cannot close your own account" }, { status: 400 });
    }

    // 4. Validate reason
    if (!ALLOWED_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${ALLOWED_REASONS.join(", ")}` },
        { status: 400 }
      );
    }

    // 5. Fetch target profile — verify existence and guard against double-close
    const { data: targetProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("account_status")
      .eq("user_id", user_id)
      .maybeSingle();

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
    if (!targetProfile) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (targetProfile.account_status === "closed") {
      return NextResponse.json({ error: "Account already closed" }, { status: 400 });
    }

    // 6. Block closure if user still has a balance
    const { data: walletRow } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", user_id)
      .maybeSingle();

    const balance = Number(walletRow?.balance ?? 0);
    if (balance > 0) {
      return NextResponse.json(
        { error: `Account has remaining balance of $${balance.toFixed(2)}. User must withdraw before account can be closed.` },
        { status: 409 }
      );
    }

    // 7. Update profile status
    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({
        account_status: "closed",
        status_reason: reason,
        closed_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // 8. Write enriched audit ledger entry
    try {
      await addLedgerEntry({
        user_id,
        amount: 0,
        type: "system",
        status: "completed",
        meta: {
          action: "account_closed",
          reason,
          closed_by: adminId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("Ledger logging failed on account close:", e);
    }

    // 9. Notify the user via email + in-app
    createNotification({
      userId: user_id,
      type: "security",
      title: "Your 1neLink account has been closed",
      body: "Your account has been closed.",
      meta: {
        action: "closed",
        reason,
      },
    }).catch(() => {});

    // 10. Notify admins
    notifyAdmins({
      title: "Account Closed",
      body: `Admin ${adminId} closed account ${user_id}. Reason: ${reason}`,
    }).catch(() => {});

    return NextResponse.json({ ok: true, closed: user_id });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
