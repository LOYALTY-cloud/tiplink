import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

    const [notesRes, adminRes, ledgerRes, anomalyRes, withdrawalRes, tipRes] = await Promise.all([
      supabaseAdmin
        .from("support_notes")
        .select(`
          id,
          note,
          created_at,
          admin:profiles!support_notes_admin_id_fkey (
            display_name,
            handle,
            role
          )
        `)
        .eq("user_id", user_id)
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("admin_actions")
        .select(`
          id,
          action,
          metadata,
          severity,
          created_at,
          admin:profiles!admin_actions_admin_id_fkey (
            display_name,
            handle,
            role
          )
        `)
        .eq("target_user", user_id)
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("transactions_ledger")
        .select("id, type, amount, status, meta, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(100),

      supabaseAdmin
        .from("fraud_anomalies")
        .select("type, score, decision, reason, flags, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(50),

      supabaseAdmin
        .from("withdrawals")
        .select("amount, status, risk_level, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(50),

      supabaseAdmin
        .from("tip_intents")
        .select("tip_amount, status, created_at")
        .eq("creator_user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const notes = (notesRes.data ?? []).map((n: any) => ({
      type: "note" as const,
      label: n.note,
      created_at: n.created_at,
      role: n.admin?.role ?? "support_admin",
      actor: n.admin?.display_name || n.admin?.handle || "Support",
    }));

    const adminActions = (adminRes.data ?? []).map((a: any) => ({
      type: "admin" as const,
      label: formatAdminAction(a.action, a.metadata),
      created_at: a.created_at,
      role: a.admin?.role ?? "super_admin",
      actor: a.admin?.display_name || a.admin?.handle || "Admin",
      severity: a.severity,
    }));

    const ledger = (ledgerRes.data ?? []).map((l: any) => ({
      type: "transaction" as const,
      label: formatTransaction(l.type, l.amount),
      created_at: l.created_at,
      role: "system",
      actor: "System",
      amount: l.amount,
    }));

    const anomalies = (anomalyRes.data ?? []).map((a: any) => ({
      type: "anomaly" as const,
      label: formatAnomaly(a.type, a.score, a.decision, a.reason),
      created_at: a.created_at,
      role: "system",
      actor: "Fraud Engine",
      score: a.score,
      decision: a.decision,
      flags: a.flags,
    }));

    const withdrawals = (withdrawalRes.data ?? []).map((w: any) => ({
      type: "withdrawal" as const,
      label: `Withdrawal $${Number(w.amount).toFixed(2)} — ${w.status}${w.risk_level ? ` (${w.risk_level} risk)` : ""}`,
      created_at: w.created_at,
      role: "system",
      actor: "System",
      amount: w.amount,
    }));

    const tips = (tipRes.data ?? []).map((t: any) => ({
      type: "tip" as const,
      label: `Tip received +$${Number(t.tip_amount).toFixed(2)} — ${t.status}`,
      created_at: t.created_at,
      role: "system",
      actor: "System",
      amount: t.tip_amount,
    }));

    const timeline = [...notes, ...adminActions, ...ledger, ...anomalies, ...withdrawals, ...tips].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({ data: timeline });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

function formatTransaction(type: string, amount: number) {
  const abs = Math.abs(amount);
  switch (type) {
    case "credit":
    case "tip_paid":
      return `Tip received +$${abs.toFixed(2)}`;
    case "debit":
      return `Debit -$${abs.toFixed(2)}`;
    case "tip_refunded":
      return `Tip refunded -$${abs.toFixed(2)}`;
    case "payout":
      return `Payout -$${abs.toFixed(2)}`;
    default:
      return `${type} $${abs.toFixed(2)}`;
  }
}

function formatAdminAction(action: string, meta: any) {
  switch (action) {
    case "set_role":
      return `Role changed to ${meta?.new_role ?? "unknown"}`;
    case "restrict":
    case "update_status":
      return meta?.new_status
        ? `Account ${meta.new_status}`
        : "Account status updated";
    case "suspend":
      return "Account suspended";
    case "close":
      return "Account closed";
    case "refund":
      return meta?.amount
        ? `Refund issued $${Number(meta.amount).toFixed(2)}${meta?.reason ? ` (${meta.reason})` : ""}`
        : "Refund issued";
    case "refund_request":
      return meta?.amount
        ? `Refund requested $${Number(meta.amount).toFixed(2)}${meta?.requires_owner ? " (owner required)" : ""}${meta?.reason ? ` — ${meta.reason}` : ""}`
        : "Refund requested";
    case "refund_approve":
      return meta?.amount
        ? `Refund approved $${Number(meta.amount).toFixed(2)} (${meta?.vote_number ?? "?"}/${meta?.required ?? "?"})`
        : "Refund approved";
    case "refund_reject":
      return meta?.amount
        ? `Refund rejected $${Number(meta.amount).toFixed(2)}${meta?.reason ? ` — ${meta.reason}` : ""}`
        : "Refund rejected";
    case "bulk_restrict":
      return "Bulk restriction applied";
    case "auto_restrict":
      return `Auto-restricted: ${meta?.reason ?? "risk alert"}${meta?.message ? ` — ${meta.message}` : ""}`;
    case "risk_eval":
      return meta?.restricted
        ? "Risk eval → restricted"
        : "Risk eval → cleared";
    default:
      return action.replace(/_/g, " ");
  }
}

function formatAnomaly(type: string, score: number, decision: string, reason: string | null) {
  const prefix = type.replace(/_/g, " ");
  const label = `${prefix} — score ${score}, ${decision}`;
  return reason ? `${label}: ${reason}` : label;
}
