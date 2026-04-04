"use client"

import { useState } from "react"
import { ui } from "@/lib/ui"
import { supabase } from "@/lib/supabase/client"

type GoalData = {
  amount: number
  period: "day" | "week" | "month"
  duration: number
  startDate: string
}

export default function GoalSetup({
  onCreate,
}: {
  onCreate: (goal: GoalData) => void
}) {
  const [amount, setAmount] = useState("")
  const [period, setPeriod] = useState<"day" | "week" | "month">("month")
  const [duration, setDuration] = useState(1)
  const [saving, setSaving] = useState(false)

  const maxDuration = period === "day" ? 31 : 12

  async function handleCreate() {
    const num = Number(amount)
    if (!num || num <= 0) return
    setSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const startDate = new Date().toISOString()

      const res = await fetch("/api/goals/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: num, period, duration, startDate }),
      })
      const json = await res.json()
      if (json.goal) {
        onCreate(json.goal)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${ui.card} p-4 md:p-5`}>

      <h3 className="text-white font-semibold mb-4">
        🎯 Set Your Goal
      </h3>

      <div className="mb-3">
        <label className="text-xs text-white/50">Goal Amount</label>
        <input
          placeholder="$500"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          className={`${ui.input} mt-1`}
        />
      </div>

      <div className="mb-3">
        <label className="text-xs text-white/50">Time Period</label>
        <select
          value={period}
          onChange={(e) =>
            setPeriod(e.target.value as "day" | "week" | "month")
          }
          className={`${ui.select} mt-1`}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="text-xs text-white/50">
          How many {period}s
        </label>
        <input
          type="number"
          min={1}
          max={maxDuration}
          value={duration}
          onChange={(e) => setDuration(Math.min(Number(e.target.value), maxDuration))}
          inputMode="numeric"
          className={`${ui.input} mt-1`}
        />
      </div>

      <button
        onClick={handleCreate}
        disabled={!amount || Number(amount) <= 0 || saving}
        className={`${ui.btnPrimary} w-full !bg-gradient-to-b !from-emerald-500 !to-emerald-700 !shadow-[0_10px_30px_rgba(34,197,94,0.35)]`}
      >
        {saving ? "Saving…" : "Set Goal"}
      </button>
    </div>
  )
}
