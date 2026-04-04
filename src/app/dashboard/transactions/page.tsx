"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, CreditCard, RotateCcw, AlertTriangle, Banknote, Settings2 } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { formatMoney } from "@/lib/walletFees"
import Avatar from "@/components/ui/Avatar"

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
    case "tip_credit":
    case "deposit":
      return <ArrowDownCircle size={20} />
    case "withdrawal":
    case "payout":
    case "payout_debit":
      return <ArrowUpCircle size={20} />
    case "card_charge":
    case "card_decline":
      return <CreditCard size={20} />
    case "tip_refunded":
    case "refund":
      return <RotateCcw size={20} />
    case "dispute":
      return <AlertTriangle size={20} />
    case "fee":
    case "withdrawal_fee":
    case "platform_fee":
      return <Banknote size={20} />
    case "adjustment":
    case "system":
      return <Settings2 size={20} />
    default:
      return <ArrowDownCircle size={20} />
  }
}

function formatDay(date: string) {
  const d = new Date(date)
  const today = new Date()

  const isToday = d.toDateString() === today.toDateString()

  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (isToday) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"

  return d.toLocaleDateString(undefined, {
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
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Transaction | null>(null)
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

    setTransactions((prev) => {
      const seen = new Set(prev.map((t) => t.id))
      return [...prev, ...data.transactions.filter((t: Transaction) => !seen.has(t.id))]
    })
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

  const totalIn = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  const totalOut = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const filtered = transactions.filter((tx) =>
    formatType(tx.type).toLowerCase().includes(search.toLowerCase())
  )

  // Track first-time supporters across the loaded transactions
  const firstTimeSupporters = useMemo(() => {
    const seen = new Set<string>()
    const firstIds = new Set<string>()
    // Process oldest-first so earliest occurrence is the "first time"
    const sorted = [...transactions].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    for (const tx of sorted) {
      if (tx.type !== "tip_received") continue
      const name = (tx.meta as any)?.supporter_name || (tx.meta as any)?.tipper_name || null
      if (!name) continue
      if (!seen.has(name)) {
        firstIds.add(tx.id)
        seen.add(name)
      }
    }
    return firstIds
  }, [transactions])

  return (
    <div className="max-w-xl mx-auto p-6">

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/50">Money in</p>
          <p className="text-lg font-semibold text-emerald-400">
            {formatMoney(totalIn)}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/50">Money out</p>
          <p className="text-lg font-semibold text-white/80">
            {formatMoney(totalOut)}
          </p>
        </div>
      </div>

      <h1 className="text-xl font-semibold mb-6">Transactions</h1>

      <input
        placeholder="Search transactions..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
      />

      {Object.entries(
        filtered.reduce((acc, tx) => {
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
            const isBigTip = tx.type === "tip_received" && tx.amount >= 100
            const isTip = tx.type === "tip_received"
            const supporterName = isTip
              ? (tx.meta?.is_anonymous ? "Anonymous" : (tx.meta as any)?.supporter_name || (tx.meta as any)?.tipper_name || "Supporter")
              : null
            const isFirstTime = firstTimeSupporters.has(tx.id)

            return (
              <div
                key={`${tx.id}-${tx.created_at}`}
                onClick={() => setSelected(tx)}
                className={`flex items-center justify-between py-3 px-3 rounded-xl cursor-pointer hover:bg-white/5 transition animate-[fadeIn_0.3s_ease] ${
                  isBigTip
                    ? "bg-emerald-500/10 border border-emerald-400/20 shadow-[0_0_20px_rgba(16,185,129,0.2)] my-1"
                    : "border-b border-neutral-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {isTip ? (
                    <Avatar name={supporterName} size={36} />
                  ) : (
                    <div className="text-neutral-400">{getIcon(tx.type)}</div>
                  )}

                  <div>
                    <p className="text-sm font-medium">
                      {formatType(tx.type)}
                    </p>
                    {isTip && (
                      <p className="text-xs text-white/50">
                        {supporterName}
                        {isFirstTime && (
                          <span className="text-xs text-yellow-400 ml-1">🎉 New</span>
                        )}
                      </p>
                    )}
                    {isTip && (tx.meta as any)?.message && (
                      <p className="text-xs text-white/60 mt-0.5">{(tx.meta as any).message}</p>
                    )}
                    <p className="text-xs text-neutral-500">{new Date(tx.created_at).toLocaleTimeString()}</p>
                    {tx.type === "tip_refunded" && (
                      <p className="text-xs text-yellow-600 mt-0.5">
                        {(tx.meta as any)?.refund_type === "partial" ? "Partial refund" : "Refund"}
                        {(tx.meta as any)?.total_refunded != null && <> · Total refunded: ${Number((tx.meta as any).total_refunded).toFixed(2)}</>}
                      </p>
                    )}
                    {tx.type === "tip_received" && (tx.meta as any)?.refund_status === "initiated" && (
                      <p className="text-xs text-orange-500 mt-0.5">Refund processing…</p>
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

      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0B0F1A] p-5 rounded-xl w-[90%] max-w-sm border border-white/10">
            <h3 className="text-lg font-semibold text-white">
              {formatType(selected.type)}
            </h3>

            <p className="text-sm text-white/60 mt-2">
              {new Date(selected.created_at).toLocaleString()}
            </p>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Amount</span>
                <span>{formatMoney(selected.amount)}</span>
              </div>

              {selected.meta?.fee != null && (
                <div className="flex justify-between">
                  <span className="text-white/60">Fee</span>
                  <span>{formatMoney(selected.meta.fee)}</span>
                </div>
              )}

              {selected.meta?.net != null && (
                <div className="flex justify-between">
                  <span className="text-white/60">Net</span>
                  <span className="text-emerald-400">
                    {formatMoney(selected.meta.net)}
                  </span>
                </div>
              )}

              {selected.type === "tip_received" && (
                <div className="flex justify-between">
                  <span className="text-white/60">From</span>
                  <span>{selected.meta?.is_anonymous ? "Anonymous" : (selected.meta as any)?.supporter_name || "Supporter"}</span>
                </div>
              )}

              {(() => {
                const msg = ((selected.meta as any)?.message || selected.meta?.note || "").trim()
                if (!msg) return null
                const fromName = selected.meta?.is_anonymous
                  ? "Anonymous"
                  : (selected.meta as any)?.supporter_name || (selected.meta as any)?.tipper_name || "Supporter"
                return (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-white/50 text-xs mb-1">Note from {fromName}</p>
                    <p className="text-white/90 text-sm italic">
                      &ldquo;{msg}&rdquo;
                    </p>
                  </div>
                )
              })()}
            </div>

            <button
              onClick={() => setSelected(null)}
              className="mt-5 w-full py-2 bg-white/10 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
