import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { anomaly_id, override } = await req.json();

    if (!anomaly_id || !["confirmed_fraud", "false_positive"].includes(override)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // false_positive overrides can unrestrict users → require restrict permission
    // confirmed_fraud is informational → view_admin is sufficient
    if (override === "false_positive") {
      requireRole(session.role, "restrict");
    } else {
      requireRole(session.role, "view_admin");
    }

    const { error } = await supabaseAdmin
      .from("fraud_anomalies")
      .update({ admin_override: override })
      .eq("id", anomaly_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If false positive, consider unrestricting the user
    if (override === "false_positive") {
      const { data: anomaly } = await supabaseAdmin
        .from("fraud_anomalies")
        .select("user_id")
        .eq("id", anomaly_id)
        .maybeSingle();

      if (anomaly?.user_id) {
        // Check if there are other unresolved anomalies for this user
        const { count } = await supabaseAdmin
          .from("fraud_anomalies")
          .select("id", { count: "exact" })
          .eq("user_id", anomaly.user_id)
          .is("admin_override", null)
          .neq("decision", "allow");

        // If no other unresolved anomalies, unrestrict
        if ((count ?? 0) === 0) {
          await supabaseAdmin
            .from("profiles")
            .update({
              account_status: "active",
              status_reason: `Cleared by admin (false positive override)`,
            })
            .eq("user_id", anomaly.user_id)
            .eq("account_status", "restricted");
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const errMsg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
