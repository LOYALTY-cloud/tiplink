"use client"

import Link from "next/link"
import ActivityTimeline from "./ActivityTimeline"

type ActivityData = {
  id: string
  action: string
  label: string
  severity: string
  target_user: string | null
  target_handle: string | null
  target_display_name: string | null
  created_at: string
  actor: string
  role: string
  metadata: Record<string, unknown>
}

const ACTION_LABELS: Record<string, string> = {
  restrict: "🔴 Account Restricted",
  suspend: "⏸️ Account Suspended",
  close: "🔒 Account Closed",
  set_role: "🔑 Role Changed",
  refund: "💸 Refund Issued",
  refund_request: "📝 Refund Requested",
  refund_approve: "✅ Refund Approved",
  refund_reject: "❌ Refund Rejected",
  bulk_restrict: "⚡ Bulk Restriction",
  auto_restrict: "🤖 Auto-Restricted",
  risk_eval: "🚩 Risk Evaluation",
  update_status: "📝 Status Updated",
  support_note: "💬 Support Note",
  tip_received: "💰 Tip Received",
  tip_credit: "💰 Tip Received",
  payout: "🏦 Payout Processed",
  dispute: "⚠️ Dispute Filed",
  tip_refunded: "💸 Tip Refunded",
  ticket_created: "🎫 Ticket Created",
  ticket_updated: "📝 Ticket Updated",
  ticket_resolved: "✅ Ticket Resolved",
  ticket_closed: "🔒 Ticket Closed",
  ticket_breached: "🚨 SLA Breached",
  ticket_reassigned: "🔁 Ticket Reassigned",
  ticket_chat_started: "💬 Chat Started",
}

const HIDDEN_META_KEYS = new Set([
  "admin_id", "stripe_account_id", "stripe_customer_id", "email",
  "phone", "password", "secret", "token", "key",
])

export default function ActivityDetailPanel({
  data,
  onClose,
}: {
  data: ActivityData
  onClose: () => void
}) {
  const meta = data.metadata ?? {}
  const visibleMeta = Object.entries(meta).filter(
    ([key]) => !HIDDEN_META_KEYS.has(key)
  )

  const isTransaction = ["tip_received", "tip_credit", "payout", "dispute", "tip_refunded"].includes(data.action)
  const isTicket = data.action.startsWith("ticket_")
  const amount = typeof meta.amount === "number" ? meta.amount : null

  const severityBadge: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400",
    high: "bg-amber-500/20 text-amber-400",
    medium: "bg-blue-500/20 text-blue-300",
    low: "bg-white/10 text-white/50",
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="w-[400px] max-w-[90vw] bg-[#0B0F1A] border-l border-white/10 p-5 overflow-y-auto animate-[slideIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-white font-semibold text-base">
              {ACTION_LABELS[data.action] ?? data.action.replace(/_/g, " ")}
            </h2>
            <p className="text-[11px] text-white/30 mt-0.5 font-mono">{data.id.slice(0, 12)}…</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/70 text-lg transition p-1"
          >
            ✕
          </button>
        </div>

        {/* Severity */}
        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider mb-4 ${severityBadge[data.severity] ?? severityBadge.low}`}>
          {data.severity}
        </span>

        {/* Transaction detail card */}
        {isTransaction && amount !== null && (
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Amount</span>
              <span className={`text-lg font-bold ${data.action === "dispute" ? "text-red-400" : data.action === "tip_refunded" ? "text-amber-400" : "text-emerald-400"}`}>
                {data.action === "dispute" || data.action === "tip_refunded" ? "-" : "+"}${Math.abs(amount).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Type</span>
              <span className="text-xs text-white/70 capitalize">{(String(meta.type ?? data.action)).replace(/_/g, " ")}</span>
            </div>
            {typeof meta.reference_id === "string" && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Reference</span>
                <span className="text-xs text-white/50 font-mono">{meta.reference_id.slice(0, 16)}…</span>
              </div>
            )}
          </div>
        )}

        {/* Ticket detail card */}
        {isTicket && (
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
            {typeof meta.subject === "string" && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Subject</span>
                <span className="text-sm text-white/90 text-right max-w-[200px] truncate">{meta.subject}</span>
              </div>
            )}
            {typeof meta.status === "string" && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  meta.status === "resolved" ? "bg-emerald-500/20 text-emerald-400"
                    : meta.status === "closed" ? "bg-white/10 text-white/50"
                    : meta.status === "open" ? "bg-blue-500/20 text-blue-300"
                    : "bg-amber-500/20 text-amber-400"
                }`}>
                  {meta.status.replace(/_/g, " ")}
                </span>
              </div>
            )}
            {typeof meta.priority === "number" && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Priority</span>
                <span className={`text-xs font-medium ${
                  meta.priority >= 3 ? "text-red-400" : meta.priority >= 2 ? "text-amber-400" : "text-white/50"
                }`}>
                  {meta.priority >= 3 ? "Critical" : meta.priority >= 2 ? "High" : meta.priority >= 1 ? "Medium" : "Normal"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Core info */}
        <div className="space-y-3 text-sm">
          <Row label="Action" value={data.label} />
          <Row label={isTransaction || isTicket ? "Source" : "Admin"} value={data.actor} />
          {data.role && data.role !== "system" && (
            <Row label="Role" value={data.role} />
          )}
          {(data.target_display_name || data.target_handle) && (
            <Row label="User" value={
              data.target_display_name
                ? `${data.target_display_name} (@${data.target_handle})`
                : `@${data.target_handle}`
            } />
          )}
          <Row label="Time" value={new Date(data.created_at).toLocaleString()} />
        </div>

        {/* Metadata */}
        {visibleMeta.length > 0 && (
          <>
            <div className="my-4 border-t border-white/10" />
            <p className="text-white/40 text-xs mb-3 font-medium uppercase tracking-wider">Metadata</p>
            <div className="space-y-2">
              {visibleMeta.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 text-xs">
                  <span className="text-white/40 shrink-0">{key.replace(/_/g, " ")}</span>
                  <span className="text-white text-right truncate">{formatValue(value)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="my-4 border-t border-white/10" />
        <div className="space-y-2">
          {data.target_user && (
            <Link
              href={`/admin/users/${data.target_user}`}
              className="block text-center bg-white/10 hover:bg-white/20 py-2.5 rounded-lg text-sm text-white transition"
            >
              👤 View User
            </Link>
          )}
          {typeof meta.ticket_id === "string" && (
            <Link
              href={`/admin/tickets/${meta.ticket_id}`}
              className="block text-center bg-white/10 hover:bg-white/20 py-2.5 rounded-lg text-sm text-white transition"
            >
              🎫 View Ticket
            </Link>
          )}
          {(typeof meta.tip_id === "string" || typeof meta.reference_id === "string") && (
            <Link
              href={`/admin/transactions?search=${meta.tip_id ?? meta.reference_id}`}
              className="block text-center bg-white/10 hover:bg-white/20 py-2.5 rounded-lg text-sm text-white transition"
            >
              💰 View Transaction
            </Link>
          )}
        </div>

        {/* Timeline */}
        {data.target_user && (
          <>
            <div className="my-4 border-t border-white/10" />
            <p className="text-white/40 text-xs mb-3 font-medium uppercase tracking-wider">Activity Timeline</p>
            <ActivityTimeline userId={data.target_user} selectedId={data.id} />
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-white/40 text-[11px] mb-0.5">{label}</p>
      <p className="text-white text-sm">{value}</p>
    </div>
  )
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (typeof v === "number") return String(v)
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}
