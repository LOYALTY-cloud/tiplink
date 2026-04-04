export type ReplyTemplate = {
  key: string
  label: string
  content: string
}

export function getReplyTemplates(category?: string): ReplyTemplate[] {
  const common: ReplyTemplate[] = [
    {
      key: "need_info",
      label: "Need more info",
      content:
        "Thanks for reaching out. Could you provide a bit more detail so we can assist you faster?",
    },
    {
      key: "resolved",
      label: "Resolved",
      content:
        "This issue has been resolved. If you have any further questions, don't hesitate to reach out.",
    },
    {
      key: "investigating",
      label: "Investigating",
      content:
        "We're looking into this now and will get back to you shortly. Thank you for your patience.",
    },
  ]

  const map: Record<string, ReplyTemplate[]> = {
    withdrawal: [
      {
        key: "withdrawal_check",
        label: "Check bank setup",
        content:
          "Please make sure your bank account is connected and verified. Withdrawals typically process within the stated timeframe after approval.",
      },
      {
        key: "withdrawal_pending",
        label: "Payout pending",
        content:
          "Your payout is currently being processed. Stripe payouts can take 2-3 business days to arrive depending on your bank.",
      },
    ],
    payment: [
      {
        key: "payment_retry",
        label: "Retry payment",
        content:
          "It looks like the payment didn't go through. Please try again with a different method or contact your bank for details.",
      },
      {
        key: "payment_refund",
        label: "Refund processing",
        content:
          "Your refund has been submitted and should appear in your account within 5-10 business days depending on your bank.",
      },
    ],
    account: [
      {
        key: "restriction_info",
        label: "Explain restriction",
        content:
          "Your account has been temporarily restricted due to unusual activity. You can request a review from your account settings.",
      },
      {
        key: "verification_needed",
        label: "Verification needed",
        content:
          "To proceed, we need to verify your identity. Please complete the verification process in your account settings.",
      },
    ],
    dispute: [
      {
        key: "dispute_info",
        label: "Dispute received",
        content:
          "We've received the dispute and are reviewing the details. We'll respond within the required timeframe and keep you updated.",
      },
      {
        key: "dispute_evidence",
        label: "Need evidence",
        content:
          "To help resolve this dispute, could you provide any additional evidence such as screenshots or communication records?",
      },
    ],
    fraud: [
      {
        key: "fraud_review",
        label: "Under review",
        content:
          "We've flagged some unusual activity on your account and are reviewing it. We'll follow up once we have more information.",
      },
    ],
    technical: [
      {
        key: "tech_known",
        label: "Known issue",
        content:
          "We're aware of this issue and our team is working on a fix. We appreciate your patience.",
      },
      {
        key: "tech_clear",
        label: "Clear cache",
        content:
          "Please try clearing your browser cache and cookies, then log in again. If the issue persists, let us know.",
      },
    ],
  }

  const categoryTemplates = map[category || ""] || []
  return [...categoryTemplates, ...common]
}
