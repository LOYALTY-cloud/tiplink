"use client"

import React, { useEffect, useRef, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, CreditCard, RotateCcw } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { formatMoney } from "@/lib/walletFees"

type Transaction = {
  id: string
  type: string
  amount: number
  created_at: string
  meta?: {
    fee?: number
    net?: number
    receipt_id?: string
    method?: string
    [key: string]: unknown
  } | null
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

    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token

    if (!token) {
      setLoading(false)
      setHasMore(false)
      return
    }

    const res = await fetch(`/api/transactions?${params.toString()}`, {
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
                    {tx.type === "tip_refunded" && (
                      <p className="text-xs text-yellow-600 mt-0.5">
                        {tx.meta?.refund_type === "partial" ? "Partial refund" : "Refund"}
                        {tx.meta?.total_refunded != null && <> · Total refunded: ${Number(tx.meta.total_refunded).toFixed(2)}</>}
                      </p>
                    )}
                    {tx.meta?.fee != null && (
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Fee: {formatMoney(tx.meta.fee)}
                        {tx.meta.net != null && <> · Net: {formatMoney(tx.meta.net)}</>}
                      </p>
                    )}
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
