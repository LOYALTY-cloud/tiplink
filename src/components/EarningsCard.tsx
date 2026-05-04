"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

export default function EarningsCard({ userId }: { userId: string }) {
  const [data, setData] = useState({ today: 0, week: 0, month: 0 })
  const [glow, setGlow] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) return
      const res = await fetch(`/api/earnings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = await res.json()
      setData(json)
    }

    load()
  }, [userId])

  // Realtime: glow on new tips
  const handleTip = useCallback((payload: { new: Record<string, unknown> }) => {
    const tx = payload.new
    const amount = Number(tx.amount ?? 0)
    if (amount > 0) {
      setData((prev) => ({
        today: prev.today + amount,
        week: prev.week + amount,
        month: prev.month + amount,
      }))
      setGlow(true)
      navigator.vibrate?.(10)
      setTimeout(() => setGlow(false), 600)
    }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(`earnings-card-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions_ledger",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const tx = payload.new as Record<string, unknown>
          if (tx.type === "tip_received") handleTip(payload as any)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, handleTip])

  return (
    <div className={`rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.03] backdrop-blur-xl p-6 transition-all duration-300 ${glow ? "revenue-glow" : ""}`}>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm text-white/50 uppercase tracking-wider font-medium">Earnings</h2>
        <Link href="/dashboard/earnings" className="text-xs text-blue-400 hover:text-blue-300 font-medium transition">
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">

        <div>
          <p className="text-xs text-white/55">Today</p>
          <p
            className={`text-lg font-semibold transition-colors duration-300 ${
              data.today > 0 ? "text-emerald-400" : "text-white/80"
            }`}
          >
            {formatMoney(data.today)}
          </p>
        </div>

        <div>
          <p className="text-xs text-white/55">This Week</p>
          <p
            className={`text-lg font-semibold transition-colors duration-300 ${
              data.week > 0 ? "text-emerald-400" : "text-white/80"
            }`}
          >
            {formatMoney(data.week)}
          </p>
        </div>

        <div>
          <p className="text-xs text-white/55">This Month</p>
          <p
            className={`text-lg font-semibold transition-colors duration-300 ${
              data.month > 0 ? "text-emerald-400" : "text-white/80"
            }`}
          >
            {formatMoney(data.month)}
          </p>
        </div>

      </div>

    </div>
  )
}
