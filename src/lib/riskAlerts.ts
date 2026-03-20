import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Create a risk alert and auto-restrict the account if severity is critical.
 */
export async function createRiskAlert(params: {
  user_id: string;
  type: string;
  message: string;
  severity: "info" | "warning" | "critical";
}) {
  const { data: alert } = await supabaseAdmin
    .from("risk_alerts")
    .insert(params)
    .select("id, severity, type, message")
    .single();

  if (alert?.severity === "critical") {
    await supabaseAdmin
      .from("profiles")
      .update({
        account_status: "restricted",
        status_reason: "auto_risk",
      })
      .eq("user_id", params.user_id);

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: null,
      action: "auto_restrict",
      target_user: params.user_id,
      metadata: {
        alert_id: alert.id,
        reason: alert.type,
        message: alert.message,
      },
      severity: "critical",
    });
  }

  return alert;
}
