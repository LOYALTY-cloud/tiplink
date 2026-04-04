"use client"

import { useEffect, useState } from "react"

type HistoryPoint = {
  id: string
  score: number
  level: string
  created_at: string
}

export default function FraudScoreChart({ userId }: { userId: string }) {
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!userId) return
    const adminSession = localStorage.getItem("admin_session")
    const adminId = adminSession ? JSON.parse(adminSession)?.admin_id : null
    if (!adminId) return

    fetch(`/api/admin/fraud-score-history?user_id=${encodeURIComponent(userId)}`, {
      headers: { "X-Admin-Id": adminId },
    })
      .then((r) => r.json())
      .then((data) => setHistory(data.history ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return null
  if (history.length < 2) return null

  const maxScore = 100
  const chartHeight = 60
  const chartWidth = Math.min(history.length * 24, 280)
  const stepX = chartWidth / (history.length - 1)

  const points = history.map((h, i) => ({
    x: i * stepX,
    y: chartHeight - (h.score / maxScore) * chartHeight,
    score: h.score,
    level: h.level,
    date: h.created_at,
  }))

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ")

  const areaD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${chartHeight} L 0 ${chartHeight} Z`

  const getColor = (level: string) =>
    level === "high" ? "#ef4444" : level === "medium" ? "#f59e0b" : "#22c55e"

  const lastPoint = points[points.length - 1]
  const lineColor = getColor(history[history.length - 1].level)

  return (
    <div className="mt-3">
      <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-2">
        Score History
      </p>
      <div className="relative bg-white/[.03] border border-white/10 rounded-lg p-3">
        <svg
          width={chartWidth}
          height={chartHeight + 4}
          viewBox={`-2 -2 ${chartWidth + 4} ${chartHeight + 8}`}
          className="overflow-visible"
        >
          {/* Threshold lines */}
          <line
            x1="0" y1={chartHeight - (70 / maxScore) * chartHeight}
            x2={chartWidth} y2={chartHeight - (70 / maxScore) * chartHeight}
            stroke="#ef444440" strokeWidth="1" strokeDasharray="4 3"
          />
          <line
            x1="0" y1={chartHeight - (30 / maxScore) * chartHeight}
            x2={chartWidth} y2={chartHeight - (30 / maxScore) * chartHeight}
            stroke="#f59e0b30" strokeWidth="1" strokeDasharray="4 3"
          />

          {/* Area fill */}
          <path d={areaD} fill={`${lineColor}15`} />

          {/* Line */}
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === i ? 4 : 2.5}
              fill={getColor(history[i].level)}
              stroke="#1a1a2e"
              strokeWidth="1.5"
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Hover tooltip */}
        {hoveredIdx !== null && (
          <div
            className="absolute z-10 bg-[#1a1a2e] border border-white/20 rounded-lg px-2.5 py-1.5 text-[10px] text-white pointer-events-none transition-opacity"
            style={{
              left: Math.min(points[hoveredIdx].x + 12, chartWidth - 80),
              top: Math.max(points[hoveredIdx].y - 36, 0),
            }}
          >
            <span className="font-medium">{history[hoveredIdx].score}/100</span>
            <span className="text-white/40 ml-1.5">
              {new Date(history[hoveredIdx].created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {/* Labels */}
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] text-white/25">
            {new Date(history[0].created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          <span className="text-[9px] text-white/25">
            {new Date(history[history.length - 1].created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
    </div>
  )
}
