export type Transaction = {
  id: string
  type: string
  amount: number
  created_at: string
  meta?: {
    fee?: number
    net?: number
    [key: string]: unknown
  } | null
}
