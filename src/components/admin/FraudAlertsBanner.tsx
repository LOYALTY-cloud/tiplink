"use client"

import { useEffect, useState, useCallback } from "react"

type FraudAlert = {
  id: string
  user_id: string
  alert_type: string
  severity: string
  message: string
  metadata: Record<string, unknown>
  created_at: string
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/15 border-red-500/30 text-red-300",
  high: "bg-amber-500/10 border-amber-500/25 text-amber-300",
  medium: "bg-white/5 border-white/15 text-white/70",
}

const ALERT_ICONS: Record<string, string> = {
  high_risk_score: "🚩",
  rapid_score_increase: "📈",
  repeat_flag: "🔁",
  verification_bypass_attempt: "🔓",
  suspicious_session: "👁️",
}

export default function FraudAlertsBanner() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([])
  const [expanded, setExpanded] = useState(false)

  const fetchAlerts = useCallback(() => {
    const adminSession = localStorage.getItem("admin_session")
    const adminId = adminSession ? JSON.parse(adminSession)?.admin_id : null
    if (!adminId) return

    fetch("/api/admin/fraud-alerts?limit=10", {
      headers: { "X-Admin-Id": adminId },
    })
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 30_000) // Poll every 30s
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const acknowledge = async (alertId: string) => {
    const adminSession = localStorage.getItem("admin_session")
    const adminId = adminSession ? JSON.parse(adminSession)?.admin_id : null
    if (!adminId) return

    await fetch("/api/admin/fraud-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Id": adminId },
      body: JSON.stringify({ alertId }),
    })

    setAlerts((prev) => prev.filter((a) => a.id !== alertId))
  }

  if (alerts.length === 0) return null

  const criticalCount = alerts.filter((a) => a.severity === "critical").length
  const topAlert = alerts[0]

  return (
    <div className="relative">
      {/* Compact bar */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition ${
          criticalCount > 0
            ? "bg-red-500/10 border-b border-red-500/20"
            : "bg-amber-500/5 border-b border-amber-500/15"
        }`}
      >
        <span className="text-sm">
          {criticalCount > 0 ? "🚨" : "⚠️"}
        </span>
        <span className={`text-xs font-medium flex-1 truncate ${
          criticalCount > 0 ? "text-red-300" : "text-amber-300"
        }`}>
          {alerts.length} fraud alert{alerts.length !== 1 ? "s" : ""} — {topAlert.message}
        </span>
        <span className="text-[10px] text-white/30">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="absolute top-full left-0 right-0 z-50 bg-[#0d0d1a] border-b border-white/10 shadow-2xl max-h-72 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 ${
                SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.medium
              }`}
            >
              <span className="text-sm mt-0.5">
                {ALERT_ICONS[alert.alert_type] ?? "⚠️"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {alert.message}
                </p>
                <p className="text-[10px] text-white/30 mt-0.5">
                  {alert.alert_type.replace(/_/g, " ")} ·{" "}
                  {new Date(alert.created_at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  acknowledge(alert.id)
                }}
                className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/50 hover:bg-white/20 hover:text-white transition flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
