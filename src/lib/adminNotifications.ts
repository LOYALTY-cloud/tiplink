import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmailAsync } from "@/lib/emailService";
import { logAdminActivity } from "@/lib/adminActivityLog";

type CreateAdminNotificationParams = {
  adminId?: string | null;
  adminTarget?: string | null;
  roleTarget?: string[] | null;
  ticketId?: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  status?: "open" | "in_progress" | "resolved" | "dismissed";
  requiresAction?: boolean;
  priority?: "low" | "medium" | "high" | "critical";
  visibility?: "private" | "role" | "global";
  metadata?: Record<string, any>;
};

const TYPE_LINK_FALLBACK: Record<string, string> = {
  disciplinary_report: "/admin/staff/tickets",
  finance_alert: "/admin/transactions",
  support_alert: "/admin/tickets",
  fraud_alert: "/admin/fraud",
  payout_alert: "/admin/transactions",
};

function getDefaultNotificationLink(type: string): string | null {
  return TYPE_LINK_FALLBACK[type] ?? null;
}

function mapNotificationTypeToActivityType(type: string): "payment" | "disciplinary" | "support" | "fraud" | "system" {
  if (type.includes("finance") || type.includes("payout") || type.includes("withdraw")) return "payment";
  if (type.includes("disciplinary")) return "disciplinary";
  if (type.includes("support") || type.includes("ticket")) return "support";
  if (type.includes("fraud") || type.includes("risk")) return "fraud";
  return "system";
}

export async function createAdminNotification({
  adminId,
  adminTarget,
  roleTarget,
  ticketId,
  type,
  title,
  message,
  link,
  status = "open",
  requiresAction = false,
  priority = "medium",
  visibility = "private",
  metadata,
}: CreateAdminNotificationParams): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_notifications")
    .insert({
      admin_id: adminId ?? adminTarget ?? null,
      admin_target: adminTarget ?? adminId ?? null,
      role_target: roleTarget ?? null,
      ticket_id: ticketId ?? null,
      type,
      title,
      message,
      link: link ?? getDefaultNotificationLink(type),
      status,
      requires_action: requiresAction,
      priority,
      visibility,
      metadata: metadata ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) return;

  void logAdminActivity({
    type: mapNotificationTypeToActivityType(type),
    title,
    description: message,
    metadata: {
      notification_type: type,
      priority,
      visibility,
      requires_action: requiresAction,
      admin_target: adminTarget ?? adminId ?? null,
      role_target: roleTarget ?? null,
      link: link ?? getDefaultNotificationLink(type),
    },
    action: "admin_notification_created",
    label: title,
    severity: priority,
  });
}

type NotifyDisciplinaryReportIssuedParams = {
  adminId: string;
  ticketId: string;
  reason: string;
};

export async function notifyDisciplinaryReportIssued({
  adminId,
  ticketId,
  reason,
}: NotifyDisciplinaryReportIssuedParams): Promise<void> {
  await createAdminNotification({
    adminId,
    ticketId,
    type: "disciplinary_report",
    title: "Disciplinary Report Issued",
    message: reason,
    link: "/admin/staff/tickets",
    status: "open",
    requiresAction: true,
    priority: "critical",
    visibility: "private",
  });

  const { data: admin } = await supabaseAdmin
    .from("admins")
    .select("id, user_id, full_name")
    .eq("id", adminId)
    .maybeSingle();

  if (!admin?.user_id) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("user_id", admin.user_id)
    .maybeSingle();

  const email = profile?.email;
  if (!email) return;

  const adminName = admin.full_name ?? "Admin";

  sendDisciplinaryNoticeEmail({
    to: email,
    adminName,
    reason,
    ticketId,
  });
}

type SendDisciplinaryNoticeEmailParams = {
  to: string;
  adminName: string;
  reason: string;
  ticketId: string;
};

export function sendDisciplinaryNoticeEmail({
  to,
  adminName,
  reason,
  ticketId,
}: SendDisciplinaryNoticeEmailParams): void {

  sendEmailAsync({
    type: "SUPPORT_MESSAGE",
    to,
    subject: "Disciplinary Notice - Action Required",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f1a;color:#e5e7eb;padding:32px 16px;">
        <div style="max-width:560px;margin:0 auto;background:#111827;border-radius:14px;padding:24px;border:1px solid rgba(239,68,68,0.35);">
          <h2 style="margin:0 0 10px;color:#fca5a5;font-size:20px;">Disciplinary Report Issued</h2>
          <p style="margin:0 0 12px;color:#d1d5db;font-size:14px;line-height:1.6;">Hi ${esc(adminName)}, a disciplinary report has been issued and requires your acknowledgement.</p>
          <div style="background:#0f172a;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin:14px 0;">
            <p style="margin:0;color:#f3f4f6;font-size:13px;line-height:1.6;"><strong>Reason:</strong> ${esc(reason)}</p>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">Please sign in to the admin panel to review and acknowledge this record.</p>
          <p style="margin:14px 0 0;color:#6b7280;font-size:11px;">Ticket ID: ${esc(ticketId)}</p>
        </div>
      </div>
    `,
  });
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}
