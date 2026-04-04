import { supabase } from "@/lib/supabase/client"
import type { Transaction } from "@/types/transactions"

export async function getRecentTransactions(): Promise<Transaction[]> {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  if (!token) return []

  const res = await fetch(`/api/transactions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) return []

  const data = await res.json()

  return data.transactions.slice(0, 4) // preview only
}
