export function formatType(type: string) {
  switch (type) {
    case "withdrawal_express": return "Stripe Express Payout"
    case "withdrawal_reversal": return "Withdrawal Reversed"
    case "tip_received": return "Tip Received"
    case "tip_refunded": return "Tip Refunded"
    case "theme_purchase": return "Theme Purchase"
    default: return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }
}

export function getTransactionIcon(type: string) {
  switch (type) {
    case "tip_received":
      return "💸"
    case "withdrawal":
      return "🏦"
    case "withdrawal_express":
      return "⚡"
    case "withdrawal_reversal":
      return "↩️"
    case "card_charge":
      return "💳"
    case "tip_refunded":
    case "refund":
      return "↩️"
    default:
      return "💸"
  }
}
