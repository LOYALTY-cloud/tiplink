export type PatternResult = {
  type: string
  severity: "low" | "medium" | "high"
  message: string
}

type Event = {
  action: string
  created_at: string
  metadata?: Record<string, unknown> | null
}

export function detectFraudPatterns(events: Event[]): PatternResult[] {
  if (!events || events.length < 2) return []

  const patterns: PatternResult[] = []
  const seen = new Set<string>()

  function add(p: PatternResult) {
    if (!seen.has(p.type)) {
      seen.add(p.type)
      patterns.push(p)
    }
  }

  // Sort ascending by time
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // 1. Rapid activity — multiple actions within 60s
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].created_at).getTime()
    const curr = new Date(sorted[i].created_at).getTime()
    if (curr - prev < 60_000) {
      add({
        type: "rapid_activity",
        severity: "medium",
        message: "Multiple actions occurred within 60 seconds.",
      })
      break
    }
  }

  // 2. Refund abuse — 2+ refunds in timeline
  const refunds = sorted.filter((e) =>
    e.action.includes("refund")
  )
  if (refunds.length >= 3) {
    add({
      type: "refund_abuse",
      severity: "high",
      message: `${refunds.length} refund events detected — possible abuse pattern.`,
    })
  } else if (refunds.length >= 2) {
    add({
      type: "refund_pattern",
      severity: "medium",
      message: "Multiple refund events detected in the timeline.",
    })
  }

  // 3. Tip → Refund loop
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i].action
    const next = sorted[i + 1].action
    if (
      (curr === "tip_received" || curr.includes("tip")) &&
      (next.includes("refund"))
    ) {
      add({
        type: "tip_refund_loop",
        severity: "high",
        message: "Tip followed by immediate refund — possible cashback abuse.",
      })
      break
    }
  }

  // 4. Restriction after activity burst
  const hasRestriction = sorted.some(
    (e) => e.action === "restrict" || e.action === "auto_restrict" || e.action === "suspend"
  )
  if (hasRestriction && sorted.length >= 5) {
    add({
      type: "escalation_pattern",
      severity: "medium",
      message: "Account restriction followed a burst of activity.",
    })
  }

  // 5. Role change — always notable
  if (sorted.some((e) => e.action === "set_role")) {
    add({
      type: "role_change",
      severity: "low",
      message: "Admin role was changed during this period.",
    })
  }

  // 6. Repeated same action — possible automation
  const actionCounts: Record<string, number> = {}
  for (const e of sorted) {
    actionCounts[e.action] = (actionCounts[e.action] ?? 0) + 1
  }
  for (const [action, count] of Object.entries(actionCounts)) {
    if (count >= 4) {
      add({
        type: "repeated_action",
        severity: "medium",
        message: `"${action.replace(/_/g, " ")}" occurred ${count} times — possible automated behavior.`,
      })
      break
    }
  }

  return patterns
}
