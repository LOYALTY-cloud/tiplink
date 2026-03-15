"use client"

import { useEffect, useState } from "react"

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

export default function EarningsCard({ userId }: { userId: string }) {
  const [data, setData] = useState({ today: 0, week: 0, month: 0 })

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/earnings?user_id=${userId}`)
      if (!res.ok) return
      const json = await res.json()
      setData(json)
    }

    load()
  }, [userId])

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">

      <h2 className="text-sm text-neutral-400 mb-4">Earnings</h2>

      <div className="grid grid-cols-3 gap-4">

        <div>
          <p className="text-xs text-neutral-500">Today</p>
          <p
            className={`text-lg font-semibold transition-colors duration-300 ${
              data.today > 0 ? "text-emerald-500" : "text-neutral-300"
            }`}
          >
            {formatMoney(data.today)}
          </p>
        </div>

        <div>
          <p className="text-xs text-neutral-500">This Week</p>
          <p
            className={`text-lg font-semibold transition-colors duration-300 ${
              data.week > 0 ? "text-emerald-500" : "text-neutral-300"
            }`}
          >
            {formatMoney(data.week)}
          </p>
        </div>

        <div>
          <p className="text-xs text-neutral-500">This Month</p>
          <p
            className={`text-lg font-semibold transition-colors duration-300 ${
              data.month > 0 ? "text-emerald-500" : "text-neutral-300"
            }`}
          >
            {formatMoney(data.month)}
          </p>
        </div>

      </div>

    </div>
  )
}
