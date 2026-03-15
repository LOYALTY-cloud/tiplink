"use client"

import React, { useEffect, useRef, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, CreditCard, RotateCcw } from "lucide-react"

type Transaction = {
  id: string
  type: string
  amount: number
  created_at: string
}

function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

function getIcon(type: string) {
  switch (type) {
    case "tip_received":
      return <ArrowDownCircle size={20} />
    case "withdrawal":
      return <ArrowUpCircle size={20} />
    case "card_charge":
      return <CreditCard size={20} />
    case "tip_refunded":
      return <RotateCcw size={20} />
    default:
      return <ArrowDownCircle size={20} />
  }
}

function formatDay(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  async function loadTransactions() {
    if (loading) return

    setLoading(true)

    const params = new URLSearchParams()
    if (cursor) params.append("cursor", cursor)

    const token = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null

    const res = await fetch(`/api/transactions?user_id=me&${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      setLoading(false)
      setHasMore(false)
      return
    }

    const data = await res.json()

    setTransactions((prev) => [...prev, ...data.transactions])
    setCursor(data.next_cursor ?? null)
    setHasMore(Boolean(data.next_cursor))
    setLoading(false)
  }

  useEffect(() => {
    loadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sentinelRef.current) return
    if (!hasMore) return

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadTransactions()
        }
      })
    })

    obs.observe(sentinelRef.current)

    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentinelRef.current, hasMore])

  return (
    <div className="max-w-xl mx-auto p-6">

      <h1 className="text-xl font-semibold mb-6">Transactions</h1>

      {Object.entries(
        transactions.reduce((acc, tx) => {
          const day = formatDay(tx.created_at)
          if (!acc[day]) acc[day] = []
          acc[day].push(tx)
          return acc
        }, {} as Record<string, Transaction[]>)
      ).map(([day, txs]) => (
        <div key={day}>
          <h2 className="text-xs text-neutral-500 mt-6 mb-2">{day}</h2>

          {txs.map((tx) => {
            const isPositive = tx.amount > 0
            const amount = Math.abs(tx.amount).toFixed(2)

            return (
              <div
                key={tx.id}
                className="flex items-center justify-between py-3 border-b border-neutral-200"
              >
                <div className="flex items-center gap-3">
                  <div className="text-neutral-400">{getIcon(tx.type)}</div>

                  <div>
                    <p className="text-sm font-medium">{formatType(tx.type)}</p>
                    <p className="text-xs text-neutral-500">{new Date(tx.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>

                <p className={`font-semibold ${isPositive ? "text-emerald-500" : "text-red-400"}`}>
                  {isPositive ? "+" : "-"}${amount}
                </p>
              </div>
            )
          })}
        </div>
      ))}

      {loading && (
        <div className="py-4 text-center text-sm text-neutral-500">Loading…</div>
      )}
      <div ref={sentinelRef} />

      {!hasMore && transactions.length === 0 && (
        <p className="text-center text-neutral-500 mt-6">No transactions yet.</p>
      )}

      {!hasMore && transactions.length > 0 && (
        <p className="text-center text-neutral-500 mt-6">End of transactions</p>
      )}

      {hasMore && !loading && (
        <div className="mt-6">
          <button onClick={loadTransactions} className="w-full py-3 bg-black text-white rounded-xl">
            Load More
          </button>
        </div>
      )}

    </div>
  )
}
