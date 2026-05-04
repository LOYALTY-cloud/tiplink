"use client"

import { useEffect, useMemo, useState } from "react"
import { getAdminHeaders } from "@/lib/auth/adminSession"
import DayDetail from "./DayDetail"

type DaySummary = {
  date: string
  total: number
  refunds: number
  fraudScore: number
  level: "low" | "medium" | "high"
}

type ActivityCalendarProps = {
  userId: string
  signedUpAt: string
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function parseMonth(month: string): { year: number; month: number } {
  const [year, monthIndex] = month.split("-").map(Number)
  return { year, month: monthIndex }
}

export default function ActivityCalendar({ userId, signedUpAt }: ActivityCalendarProps) {
  const signedDate = useMemo(() => {
    const d = new Date(signedUpAt)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [signedUpAt])

  const now = useMemo(() => new Date(), [])
  const firstYear = signedDate.getUTCFullYear()
  const firstMonthNum = signedDate.getUTCMonth() + 1
  const currentYear = now.getUTCFullYear()
  const currentMonthNum = now.getUTCMonth() + 1

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonthNum, setSelectedMonthNum] = useState(currentMonthNum)

  const month = `${selectedYear}-${String(selectedMonthNum).padStart(2, "0")}`

  const [days, setDays] = useState<DaySummary[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Clamp year/month to valid range when bounds change
  useEffect(() => {
    setSelectedYear((y) => Math.max(firstYear, Math.min(currentYear, y)))
  }, [firstYear, currentYear])

  useEffect(() => {
    const minM = selectedYear === firstYear ? firstMonthNum : 1
    const maxM = selectedYear === currentYear ? currentMonthNum : 12
    setSelectedMonthNum((m) => Math.max(minM, Math.min(maxM, m)))
  }, [selectedYear, firstYear, firstMonthNum, currentYear, currentMonthNum])

  const yearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = currentYear; y >= firstYear; y--) years.push(y)
    return years
  }, [firstYear, currentYear])

  const monthOptions = useMemo(() => {
    const minM = selectedYear === firstYear ? firstMonthNum : 1
    const maxM = selectedYear === currentYear ? currentMonthNum : 12
    const out: number[] = []
    for (let m = maxM; m >= minM; m--) out.push(m)
    return out
  }, [selectedYear, firstYear, firstMonthNum, currentYear, currentMonthNum])

  useEffect(() => {
    const minM = selectedYear === firstYear ? firstMonthNum : 1
    const maxM = selectedYear === currentYear ? currentMonthNum : 12
    if (selectedMonthNum < minM || selectedMonthNum > maxM) return // wait for clamp
    setLoading(true)
    fetch(`/api/admin/calendar-summary?user_id=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`, {
      headers: getAdminHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        const incoming = (data.days ?? []) as DaySummary[]
        setDays(incoming)

        if (selectedDay && !selectedDay.startsWith(month)) {
          setSelectedDay(null)
        }
      })
      .finally(() => setLoading(false))
  }, [month, userId, selectedYear, selectedMonthNum, firstYear, firstMonthNum, currentYear, currentMonthNum])

  const dayMap = useMemo(() => {
    const map = new Map<string, DaySummary>()
    days.forEach((d) => map.set(d.date, d))
    return map
  }, [days])

  const daysArray = useMemo(() => {
    const { year, month: monthIndex } = parseMonth(month)
    const firstDay = new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay()
    const count = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()

    const grid: Array<string | null> = []
    for (let i = 0; i < firstDay; i += 1) grid.push(null)
    for (let day = 1; day <= count; day += 1) {
      grid.push(`${month}-${String(day).padStart(2, "0")}`)
    }
    return grid
  }, [month])

  const getColor = (level: string) => {
    if (level === "high") return "bg-red-500 text-white"
    if (level === "medium") return "bg-amber-400 text-black"
    return "bg-green-500 text-white"
  }

  if (loading) {
    return <p className="text-xs text-white/50">Loading calendar…</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-white">Activity Calendar</h2>
        <div className="flex items-center gap-1.5">
          <select
            value={selectedMonthNum}
            onChange={(e) => { setSelectedMonthNum(Number(e.target.value)); setSelectedDay(null) }}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m} className="bg-slate-900 text-white">
                {MONTH_NAMES[m - 1]}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(Number(e.target.value)); setSelectedDay(null) }}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} className="bg-slate-900 text-white">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-1">
        {DAY_LABELS.map((label) => (
          <div key={label} className="text-[10px] text-white/45 text-center font-medium">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {daysArray.map((date, idx) => {
          if (!date) {
            return <div key={`blank-${idx}`} className="h-10" />
          }

          const data = dayMap.get(date)
          const isSelected = selectedDay === date
          const dayNum = date.split("-")[2]

          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : date)}
              title={data ? `${data.total} event(s), ${data.refunds} refund(s), risk: ${data.fraudScore}` : "No activity"}
              className={`h-10 rounded flex items-center justify-center text-xs font-medium transition-all
                ${data ? getColor(data.level) : "bg-white/5 text-white/55"}
                ${isSelected ? "ring-2 ring-white ring-offset-1 ring-offset-black" : "hover:ring-1 hover:ring-white/30"}
              `}
            >
              {dayNum}
            </button>
          )
        })}
      </div>

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
          <span className="w-3 h-3 rounded bg-white/5 inline-block border border-white/[0.12]" />
          <span className="text-[10px] text-white/50">No activity</span>
        </div>
      </div>

      {selectedDay && <DayDetail date={selectedDay} userId={userId} />}
    </div>
  )
}
