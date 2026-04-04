"use client"

import { useEffect, useState } from "react"
import { getAdminHeaders } from "@/lib/auth/adminSession"
import DayDetail from "./DayDetail"

type DaySummary = {
  date: string
  total: number
  refunds: number
  fraudScore: number
  level: "low" | "medium" | "high"
}

export default function ActivityCalendar({ userId }: { userId: string }) {
  const [days, setDays] = useState<DaySummary[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/calendar-summary?user_id=${encodeURIComponent(userId)}`, {
      headers: getAdminHeaders(),
    })
      .then((res) => res.json())
      .then((data) => setDays(data.days ?? []))
      .finally(() => setLoading(false))
  }, [userId])

  const getColor = (level: string) => {
    if (level === "high") return "bg-red-500 text-white"
    if (level === "medium") return "bg-amber-400 text-black"
    return "bg-green-500 text-white"
  }

  // Build a 30-day grid (most recent first) — use UTC to avoid DST duplicates
  const today = new Date()
  const daysArray = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - i))
    return d.toISOString().split("T")[0]
  })

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  if (loading) {
    return <p className="text-xs text-white/50">Loading calendar…</p>
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-white mb-3">Activity Calendar (Last 30 Days)</h2>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 gap-2 mb-1">
        {dayLabels.map((label) => (
          <div key={label} className="text-[10px] text-white/30 text-center font-medium">
            {label}
          </div>
        ))}
      </div>

      {/* Month Grid */}
      <div className="grid grid-cols-7 gap-2">
        {daysArray.map((date) => {
          const data = days.find((d) => d.date === date)
          const isSelected = selectedDay === date
          const dayNum = date.split("-")[2]

          return (
            <div
              key={date}
              onClick={() => setSelectedDay(isSelected ? null : date)}
              title={data ? `${data.total} event(s), ${data.refunds} refund(s), risk: ${data.fraudScore}` : "No activity"}
              className={`h-10 rounded cursor-pointer flex items-center justify-center text-xs font-medium transition-all
                ${data ? getColor(data.level) : "bg-white/5 text-white/40"}
                ${isSelected ? "ring-2 ring-white ring-offset-1 ring-offset-black" : "hover:ring-1 hover:ring-white/30"}
              `}
            >
              {dayNum}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-500 inline-block" />
          <span className="text-[10px] text-white/50">Low</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
          <span className="text-[10px] text-white/50">Medium</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500 inline-block" />
          <span className="text-[10px] text-white/50">High</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-white/5 inline-block border border-white/10" />
          <span className="text-[10px] text-white/50">No activity</span>
        </div>
      </div>

      {/* Day Drilldown */}
      {selectedDay && <DayDetail date={selectedDay} userId={userId} />}
    </div>
  )
}
