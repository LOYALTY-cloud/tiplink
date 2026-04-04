"use client"

import { useEffect, useState } from "react"
import { detectFraudPatterns, type PatternResult } from "@/lib/fraudPatternDetector"
import { calculateFraudScore, type FraudScoreResult } from "@/lib/fraudScoring"
import { groupSessions, type Session } from "@/lib/sessionGrouper"
import FraudScoreChart from "@/components/admin/FraudScoreChart"

type TimelineItem = {
  id: string
  action: string
  severity: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const ACTION_ICONS: Record<string, string> = {
  restrict: "🔴",
  suspend: "⏸️",
  close: "🔒",
  set_role: "🔑",
  refund: "💸",
  refund_request: "📝",
  refund_approve: "✅",
  refund_reject: "❌",
  bulk_restrict: "⚡",
  auto_restrict: "🤖",
  auto_flag: "🤖",
  admin_override: "⚙️",
  risk_eval: "🚩",
  update_status: "📝",
  support_note: "💬",
}

export default function ActivityTimeline({
  userId,
  selectedId,
}: {
  userId: string
  selectedId: string
}) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [patterns, setPatterns] = useState<PatternResult[]>([])
  const [fraudScore, setFraudScore] = useState<FraudScoreResult | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [aiExplanation, setAiExplanation] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [flagged, setFlagged] = useState(false)
  const [flagSkipReason, setFlagSkipReason] = useState<string | null>(null)
  const [verificationRequired, setVerificationRequired] = useState(false)

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    setLoading(true)

    fetch(`/api/admin/activity-timeline?user_id=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTimeline(data.timeline ?? [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [userId])

  // Run all analysis when timeline loads
  useEffect(() => {
    if (timeline.length < 2) {
      setPatterns([])
      setFraudScore(null)
      setSessions([])
      setAiExplanation("")
      setFlagged(false)
      return
    }

    // 1. Pattern detection (instant)
    const detected = detectFraudPatterns(timeline)
    setPatterns(detected)

    // 2. Fraud score (instant)
    const score = calculateFraudScore(detected)
    setFraudScore(score)

    // 3. Session grouping (instant)
    setSessions(groupSessions(timeline))

    const adminSession = localStorage.getItem("admin_session")
    const adminId = adminSession ? JSON.parse(adminSession)?.admin_id : null

    // 4. Auto-flag if high risk
    if (score.shouldFlag && userId && adminId) {
      fetch("/api/admin/auto-flag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": adminId,
        },
        body: JSON.stringify({
          userId,
          score: score.score,
          patterns: detected.map((p) => ({ type: p.type, severity: p.severity })),
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.flagged) {
            setFlagged(true)
            if (data.verification_required) setVerificationRequired(true)
          } else if (data.skipped) {
            setFlagSkipReason(data.reason)
          }
        })
        .catch(() => {})
    }

    // 5. AI explanation (async)
    if (adminId) {
      setAiLoading(true)
      fetch("/api/admin/ai-timeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": adminId,
        },
        body: JSON.stringify({ events: timeline }),
      })
        .then((r) => r.json())
        .then((data) => setAiExplanation(data.explanation ?? ""))
        .catch(() => {})
        .finally(() => setAiLoading(false))
    }
  }, [timeline, userId])

  if (loading) {
    return <p className="text-white/40 text-xs py-2">Loading timeline…</p>
  }

  if (timeline.length === 0) {
    return <p className="text-white/30 text-xs py-2">No related activity</p>
  }

  return (
    <div className="relative">
      {/* Fraud Score */}
      {fraudScore && (
        <div className="mb-4">
          <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-1.5">
            Fraud Score
          </p>
          <div className={`text-sm font-medium p-2.5 rounded-lg ${
            fraudScore.level === "high"
              ? "bg-red-500/15 text-red-400 border border-red-500/20"
              : fraudScore.level === "medium"
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
              : "bg-green-500/15 text-green-400 border border-green-500/20"
          }`}>
            {fraudScore.score} / 100 — {fraudScore.level.toUpperCase()}
          </div>
          {flagged && (
            <p className="text-red-400 text-xs mt-1.5">
              🚩 User automatically flagged for review
            </p>
          )}
          {flagged && verificationRequired && (
            <p className="text-red-300 text-xs mt-1">
              🔒 Verification required — score ≥ 90
            </p>
          )}
          {flagSkipReason === "already_flagged" && (
            <p className="text-white/40 text-xs mt-1.5">
              Already flagged with equal or higher score
            </p>
          )}
          {flagSkipReason === "cooldown" && (
            <p className="text-white/40 text-xs mt-1.5">
              Flag cooldown active (10min window)
            </p>
          )}
        </div>
      )}

      {/* Fraud Score History Chart */}
      <FraudScoreChart userId={userId} />

      {/* Session-grouped timeline */}
      <div className="space-y-3">
        {sessions.map((session, i) => (
          <div
            key={i}
            className={`rounded-lg border p-2.5 ${
              session.suspicious
                ? "border-red-500/25 bg-red-500/5"
                : "border-white/10 bg-white/[.03]"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-white/40">
                {session.suspicious ? "🔴 " : ""}Session {i + 1} · {session.events.length} event{session.events.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-white/25">
                {new Date(session.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {session.events.map((item) => {
              const isSelected = item.id === selectedId
              const icon = ACTION_ICONS[item.action as string] ?? "📋"
              const label = (item.action as string).replace(/_/g, " ")

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 py-1 px-1.5 rounded transition ${
                    isSelected ? "bg-white/10" : ""
                  }`}
                >
                  <span className={`text-xs shrink-0 ${isSelected ? "" : "opacity-60"}`}>
                    {icon}
                  </span>
                  <span className={`text-xs capitalize truncate flex-1 ${
                    isSelected ? "text-white font-medium" : "text-white/70"
                  }`}>
                    {label}
                  </span>
                  <span className="text-[10px] text-white/25 shrink-0">
                    {new Date(item.created_at as string).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Detected Patterns */}
      {patterns.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-red-400 text-[11px] font-semibold uppercase tracking-wider">
            ⚠️ Detected Patterns
          </p>
          {patterns.map((p, i) => (
            <div
              key={i}
              className={`text-xs p-2 rounded-lg border ${
                p.severity === "high"
                  ? "bg-red-500/10 border-red-500/20 text-red-300"
                  : p.severity === "medium"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  : "bg-white/5 border-white/10 text-white/60"
              }`}
            >
              {p.message}
            </div>
          ))}
        </div>
      )}

      {/* AI Insight */}
      {aiLoading ? (
        <div className="mt-4">
          <p className="text-white/30 text-xs">🤖 Analyzing timeline…</p>
        </div>
      ) : aiExplanation ? (
        <div className="mt-4">
          <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-1.5">
            🤖 AI Insight
          </p>
          <div className="text-xs text-white/70 bg-white/5 border border-white/10 p-3 rounded-lg leading-relaxed">
            {aiExplanation}
          </div>
        </div>
      ) : null}
    </div>
  )
}
