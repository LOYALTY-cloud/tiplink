"use client"

import { useEffect, useState } from "react"
import { getAdminHeaders } from "@/lib/auth/adminSession"

type DayEvent = {
  id?: string
  action: string
  severity?: string
  created_at: string
}

type Snapshot = {
  events: DayEvent[]
  summary: { total?: number; refunds?: number }
  fraud_score: number
  risk_level: string
}

export default function DayDetail({
  date,
  userId,
}: {
  date: string
  userId: string
}) {
  const [events, setEvents] = useState<DayEvent[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<"snapshot" | "live">("snapshot")

  useEffect(() => {
    setLoading(true)

    // Try permanent snapshot first
    fetch(`/api/admin/day-snapshot?user_id=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`, {
      headers: getAdminHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.snapshot) {
          setSnapshot(data.snapshot)
          setEvents(data.snapshot.events ?? [])
          setSource("snapshot")
          setLoading(false)
        } else {
          // Fallback to live timeline (today or before cron ran)
          return fetch(`/api/admin/activity-timeline?user_id=${encodeURIComponent(userId)}`, {
            headers: getAdminHeaders(),
          })
            .then((res) => res.json())
            .then((data) => {
              const filtered = (data.timeline ?? []).filter((e: DayEvent) =>
                e.created_at.startsWith(date)
              )
              setEvents(filtered)
              setSource("live")
              setLoading(false)
            })
        }
      })
      .catch(() => setLoading(false))
  }, [date, userId])

  if (loading) {
    return (
      <div className="mt-4 border border-white/10 p-3 rounded">
        <p className="text-xs text-white/50">Loading…</p>
      </div>
    )
  }

  return (
    <div className="mt-4 border border-white/10 p-3 rounded">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-white font-semibold">{date}</p>
        <div className="flex items-center gap-2">
          {snapshot && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              snapshot.risk_level === "high" ? "bg-red-500/20 text-red-400" :
              snapshot.risk_level === "medium" ? "bg-amber-500/20 text-amber-400" :
              "bg-green-500/20 text-green-400"
            }`}>
              Risk: {snapshot.fraud_score}
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            source === "snapshot" ? "bg-blue-500/15 text-blue-400" : "bg-white/10 text-white/40"
          }`}>
            {source === "snapshot" ? "📦 Archived" : "⚡ Live"}
          </span>
        </div>
      </div>

      {snapshot?.summary && (
        <div className="flex gap-3 mb-2">
          <span className="text-[10px] text-white/40">{snapshot.summary.total ?? 0} events</span>
          <span className="text-[10px] text-white/40">{snapshot.summary.refunds ?? 0} refunds</span>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-xs text-white/40">No activity on this day.</p>
      ) : (
        <div className="space-y-1">
          {events.map((e, i) => (
            <div key={e.id ?? i} className="text-xs text-white/70 flex items-start gap-1.5">
              <span className="text-white/40">•</span>
              <span>{e.action}</span>
              <span className="text-white/30 ml-auto shrink-0">
                {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
