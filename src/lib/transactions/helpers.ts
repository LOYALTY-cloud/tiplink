export function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

export function getTransactionIcon(type: string) {
  switch (type) {
    case "tip_received":
      return "💸"
    case "withdrawal":
      return "🏦"
    case "card_charge":
      return "💳"
    case "tip_refunded":
      return "↩️"
    default:
      return "💸"
  }
}
