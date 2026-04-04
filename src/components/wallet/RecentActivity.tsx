"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { formatMoney } from "@/lib/walletFees"
import { getRecentTransactions } from "@/lib/transactions/getRecentTransactions"
import { formatType, getTransactionIcon } from "@/lib/transactions/helpers"
import type { Transaction } from "@/types/transactions"

export default function RecentActivity() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const router = useRouter()

  useEffect(() => {
    getRecentTransactions().then(setTransactions)
  }, [])

  if (!transactions.length) {
    return (
      <div className="mt-10">
        <p className="text-sm text-white/40">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="mt-10 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">Recent activity</p>

        <button
          onClick={() => router.push("/dashboard/transactions")}
          className="text-xs text-blue-400 hover:underline"
        >
          View all
        </button>
      </div>

      {transactions.map((tx) => {
        const isPositive = tx.amount > 0

        return (
          <div
            key={tx.id}
            className="flex items-center justify-between py-2 border-b border-white/5 animate-[fadeIn_0.3s_ease]"
          >
            <div className="flex items-center gap-3">
              <div className="text-lg">{getTransactionIcon(tx.type)}</div>

              <div>
                <p className="text-sm text-white/90">
                  {formatType(tx.type)}
                </p>
                <p className="text-xs text-white/50">
                  {new Date(tx.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>

            <p
              className={`text-sm font-semibold ${
                isPositive ? "text-emerald-400" : "text-white/80"
              }`}
            >
              {isPositive ? "+" : "-"}
              {formatMoney(Math.abs(tx.amount))}
            </p>
          </div>
        )
      })}
    </div>
  )
}
