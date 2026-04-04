"use client"

import { useState } from "react"

type Section = {
  title: string
  content: React.ReactNode
}

type Category = {
  label: string
  emoji: string
  sections: Section[]
}

export default function AdminGuidePage() {
  const [openIndex, setOpenIndex] = useState<string | null>("0-0")

  const categories: Category[] = [
    {
      label: "How to Operate",
      emoji: "🛠",
      sections: [
        {
          title: "🔍 Fraud — How It Works",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  Every tip payment is automatically scored by a 3-layer fraud system before it goes through.
                  The system combines rule-based checks, behavioral analysis, and AI to generate a single score from 0–100.
                  Higher score = higher risk. The system then makes a decision automatically based on that score.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">The 3 Scoring Layers</p>
                <div className="space-y-2">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-400 mb-1">Layer 1 — Rules (50% of score)</p>
                    <p className="text-xs text-white/60">
                      Checks hard signals: unusually large tip amounts, repeat use of the same card, 
                      refund history, and brand-new accounts. Each red flag adds points.
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-amber-400 mb-1">Layer 2 — Behavior (30% of score)</p>
                    <p className="text-xs text-white/60">
                      Looks at patterns over time: burst activity (many tips in seconds), 
                      using lots of different cards (fan-out), high dollar volume, 
                      tipping from multiple IP addresses, and micro-transactions (many tiny payments under $2).
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-purple-400 mb-1">Layer 3 — AI (20% of score)</p>
                    <p className="text-xs text-white/60">
                      An AI model reviews the full context (amount, history, account age, IPs, cards, time of day) 
                      and gives its own independent score with a written reasoning. This catches patterns the rules miss.
                      If AI is unavailable, this layer scores 0 — the system never blocks on AI failure.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Trust Adjustments</p>
                <p className="text-xs text-white/70">
                  Before making a decision, the system subtracts points for trusted signals:
                </p>
                <ul className="list-disc pl-5 text-xs text-white/60 mt-1 space-y-1">
                  <li>KYC-verified user → score reduced by 10</li>
                  <li>Account older than 30 days → reduced by 5</li>
                  <li>Account older than 90 days → reduced by an additional 3</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Escalation Rule</p>
                <p className="text-xs text-white/70">
                  If a user already has 2 or more flagged anomalies in the last 10 minutes, the system 
                  forces their score to a minimum of 80 — which means automatic restriction. Repeat offenders 
                  are caught even if individual transactions look borderline.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What Happens at Each Score</p>
                <div className="rounded-lg overflow-hidden border border-white/10 mt-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Score</th>
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Decision</th>
                        <th className="text-left px-3 py-2 text-white/50 font-medium">What Happens</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/70">
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2 text-red-400 font-medium">80–100</td>
                        <td className="px-3 py-2">Restrict</td>
                        <td className="px-3 py-2">Transaction blocked. Account auto-restricted. You get notified.</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2 text-amber-400 font-medium">60–79</td>
                        <td className="px-3 py-2">Review</td>
                        <td className="px-3 py-2">Transaction goes through, but admins are notified to review.</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2 text-yellow-400 font-medium">40–59</td>
                        <td className="px-3 py-2">Flag</td>
                        <td className="px-3 py-2">Transaction goes through. Logged as an anomaly for records.</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2 text-emerald-400 font-medium">0–39</td>
                        <td className="px-3 py-2">Allow</td>
                        <td className="px-3 py-2">Transaction goes through normally. No action needed.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Hard Blocks (Before Scoring)</p>
                <p className="text-xs text-white/70 mb-1">
                  Some things get blocked instantly before the scoring even runs:
                </p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Tip below $1 or above $500</li>
                  <li>User or IP exceeded $2,000/day in tips</li>
                  <li>More than 5 tips per minute from same user or IP</li>
                  <li>3 or more refunds in the last 30 days (chargeback risk)</li>
                  <li>More than 10 sub-$2 transactions from same IP in 5 minutes (card testing)</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-2">The Fraud Dashboard</p>
                <p className="text-xs text-white/70 mb-2">
                  Go to <strong className="text-white">Admin → Fraud</strong> to see all flagged activity. 
                  The four stats at the top tell you the current state:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white">Total</p>
                    <p className="text-xs text-white/50">All anomalies detected in the current view.</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-xs font-medium text-red-400">Restricted</p>
                    <p className="text-xs text-white/50">Score was 80+. Account was auto-restricted and transaction was blocked.</p>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-xs font-medium text-amber-400">Needs Review</p>
                    <p className="text-xs text-white/50">Score was 60–79. Transaction went through but needs your eyes on it.</p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-400">Unresolved</p>
                    <p className="text-xs text-white/50">No admin has reviewed it yet. This is your backlog — work through these.</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Your Actions</p>
                <p className="text-xs text-white/70 mb-1">
                  Each anomaly row has two buttons:
                </p>
                <ul className="text-xs text-white/60 space-y-1">
                  <li><strong className="text-red-400">Fraud</strong> — Confirm this was real fraud. Keeps the restriction in place.</li>
                  <li><strong className="text-emerald-400">FP (False Positive)</strong> — This was a legitimate transaction flagged by mistake. 
                  If this was the user's last unresolved anomaly, their account is <strong className="text-white">automatically unrestricted</strong>.</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Score Breakdown</p>
                <p className="text-xs text-white/70">
                  Each row shows an R / B / AI split — these are the individual scores from Rules, Behavior, and AI 
                  before weighting. Use this to understand <em>why</em> something was flagged. If the AI score is high 
                  but rules are low, the AI caught something subtle. If rules are high but AI is 0, the AI was unavailable.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Unresolved is the most important number. If it's growing, the team is falling behind on triage. 
                  Every anomaly should be reviewed and marked as either Fraud or False Positive.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "⚖️ Disputes — Chargebacks",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  Disputes appear when a tipper contacts their bank or card company to reverse a payment.
                  Stripe fires a chargeback event, and the disputed tip automatically appears on the Disputes page.
                  You do not create disputes manually — they come from Stripe.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What You See</p>
                <p className="text-xs text-white/70 mb-2">
                  Each dispute card shows:
                </p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Tip receipt ID and dollar amount</li>
                  <li>Who created the tip (linked to their user profile)</li>
                  <li>Stripe Payment Intent ID (for looking it up in Stripe Dashboard if needed)</li>
                  <li>Date the dispute was filed</li>
                  <li>A severity badge based on how many active disputes the same person has</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Severity Levels</p>
                <div className="rounded-lg overflow-hidden border border-white/10 mt-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Level</th>
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Condition</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/70">
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2"><span className="text-red-400 font-medium">HIGH</span></td>
                        <td className="px-3 py-2">User has 3 or more active disputes</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2"><span className="text-amber-400 font-medium">MEDIUM</span></td>
                        <td className="px-3 py-2">User has 1–2 active disputes</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2"><span className="text-emerald-400 font-medium">LOW</span></td>
                        <td className="px-3 py-2">First dispute for this user</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What You Can Do</p>
                <p className="text-xs text-white/70">
                  The disputes page is read-only — it is a monitoring view. To take action on a disputed user 
                  (restrict, refund, etc.), click through to their user profile from the dispute card. 
                  Refunds and account restrictions are handled from the user detail page.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Real-Time Updates</p>
                <p className="text-xs text-white/70">
                  The page auto-refreshes when new disputes arrive from Stripe. You do not need to reload.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Disputes cost the platform money. If a user has HIGH severity (3+ disputes), 
                  consider restricting them immediately from their profile page.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "💬 Support — Live Chat System",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  Users can open live support chats from their dashboard. The AI handles the first response automatically.
                  When the AI cannot help or the user needs a human, the chat enters the Support Queue for an admin to pick up.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">The Queue</p>
                <p className="text-xs text-white/70 mb-2">
                  The Support Queue page shows all open chats, sorted by priority (highest first), then by how long they have been waiting. 
                  At the top is a Team Status panel showing which admins are online, busy, or offline.
                </p>
                <p className="text-xs text-white/70">Each chat in the queue shows:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 mt-1 space-y-1">
                  <li>User handle (or &quot;Anonymous&quot;)</li>
                  <li>Priority badge — CRITICAL (3+), HIGH (2), or MED (1)</li>
                  <li>Whether it is still in AI mode (🤖 AI badge)</li>
                  <li>Whether it has been escalated (🔥 ESCALATED badge with reason)</li>
                  <li>Last message preview and how long ago</li>
                  <li>Which admin is assigned (if any)</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Session Statuses</p>
                <div className="space-y-2 mt-1">
                  <div className="flex items-start gap-2">
                    <span className="inline-block w-2 h-2 mt-1 rounded-full bg-yellow-400 shrink-0" />
                    <p className="text-xs text-white/60"><strong className="text-white">Waiting</strong> — User started a chat but no admin has taken it yet, or the previous admin went idle and it was returned to the queue.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-block w-2 h-2 mt-1 rounded-full bg-emerald-400 shrink-0" />
                    <p className="text-xs text-white/60"><strong className="text-white">Active</strong> — An admin is handling this chat right now.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-block w-2 h-2 mt-1 rounded-full bg-white/30 shrink-0" />
                    <p className="text-xs text-white/60"><strong className="text-white">Closed</strong> — Session ended (by admin, user, or system). Removed from the queue automatically.</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Taking Over a Chat</p>
                <ol className="list-decimal pl-5 text-xs text-white/60 space-y-1">
                  <li>Click &quot;Open Chat&quot; on a waiting session</li>
                  <li>Click the <strong className="text-white">Takeover</strong> button</li>
                  <li>The session switches to active, assigns you, and turns off AI mode</li>
                  <li>If another admin is already assigned, you can &quot;Force Takeover&quot;</li>
                </ol>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Transferring a Chat</p>
                <ol className="list-decimal pl-5 text-xs text-white/60 space-y-1">
                  <li>Open the 3-dot menu → &quot;Transfer Session&quot;</li>
                  <li>Select the target admin from the dropdown</li>
                  <li>They get a notification and can accept or decline</li>
                  <li>If accepted, the chat moves to them and you are redirected back to the queue</li>
                </ol>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Chat Features</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Real-time messages with typing indicators and read receipts</li>
                  <li>File and image uploads (up to 10 MB)</li>
                  <li>AI-suggested replies appear after each user message — click to use, or type your own</li>
                  <li>Smart menu: send wallet link, onboarding link, password reset link, or transaction link</li>
                  <li>User Card sidebar: slide-in panel showing the user&apos;s profile, wallet balance, recent transactions, and past support sessions</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Auto-Close Rules</p>
                <p className="text-xs text-white/70 mb-1">
                  The system automatically cleans up inactive sessions every 5 minutes:
                </p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">Waiting</strong> sessions with no activity for 30 minutes → auto-closed</li>
                  <li><strong className="text-white">Active</strong> sessions with no activity for 60 minutes → auto-closed</li>
                  <li>If an admin goes idle for 15+ minutes on an active chat → session is unassigned and returned to the queue so another admin can pick it up</li>
                </ul>
                <p className="text-xs text-white/50 mt-1">
                  Users see a system message: &quot;This conversation was automatically closed due to inactivity.&quot;
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Do not leave chats sitting in &quot;waiting&quot;. If you take over a chat, stay active. 
                  If you need to step away, transfer the session to another admin first.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "📊 Activity — Live Feed",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Activity page is a real-time feed of everything happening on the platform. 
                  It merges admin actions, financial transactions, and support tickets into one chronological timeline.
                  Only <strong className="text-white">Owner</strong> and <strong className="text-white">Super Admin</strong> roles can access this page.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What Shows Up</p>
                <div className="space-y-2">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-400 mb-1">Admin Actions</p>
                    <p className="text-xs text-white/60">
                      Role changes, account restrictions, suspensions, closures, refunds, risk evaluations, 
                      override decisions, bulk actions, and support notes.
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-emerald-400 mb-1">Transactions</p>
                    <p className="text-xs text-white/60">
                      Tips received, tip credits, payouts, disputes, and tip refunds — with dollar amounts.
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-purple-400 mb-1">Support Tickets</p>
                    <p className="text-xs text-white/60">
                      Tickets created, updated, resolved, closed, SLA breaches, and reassignments.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Each Entry Shows</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Action icon and human-readable description</li>
                  <li>Severity badge (critical, high, medium, or low)</li>
                  <li>Which user was affected (linked to their profile)</li>
                  <li>Which admin performed the action and their role</li>
                  <li>Relative timestamp (&quot;just now&quot;, &quot;5m ago&quot;, &quot;2h ago&quot;)</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Filters</p>
                <p className="text-xs text-white/70">
                  Use the filter bar to narrow the feed: <strong className="text-white">All</strong>, <strong className="text-white">Admin</strong> (admin actions only), 
                  <strong className="text-white">Tickets</strong>, <strong className="text-white">Tips</strong>, <strong className="text-white">Refunds</strong>, or <strong className="text-white">Disputes</strong>.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Detail Panel</p>
                <p className="text-xs text-white/70">
                  Click any entry to open a slide-in detail panel with the full information: 
                  action ID, severity, amounts, reference IDs, ticket subjects, user links, 
                  actor info, full timestamps, and all metadata. Sensitive data like emails and tokens are hidden.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ The activity feed refreshes every 8 seconds and holds up to 200 items. 
                  Use it to monitor the platform in real time and spot unusual patterns.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "📋 Logs — Audit Trail",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Action Logs page is a complete audit trail of every action taken by admins and the system.
                  Unlike the Activity feed, Logs focuses specifically on admin actions — not transactions or tickets.
                  This is where you go to answer &quot;who did what and when.&quot;
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What Gets Logged</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">Status changes</strong> — any time an account is set to active, restricted, suspended, or closed</li>
                  <li><strong className="text-white">Role assignments</strong> — when a user is given an admin role</li>
                  <li><strong className="text-white">Refunds</strong> — requests, approvals, rejections, and retries</li>
                  <li><strong className="text-white">Bulk restrictions</strong> — when multiple accounts are restricted at once</li>
                  <li><strong className="text-white">Risk evaluations</strong> — manual risk engine runs with results</li>
                  <li><strong className="text-white">Auto-restrictions</strong> — when the system restricts an account automatically</li>
                  <li><strong className="text-white">Support actions</strong> — session closures (with duration), takeovers, transfers, and internal notes</li>
                  <li><strong className="text-white">System cleanup</strong> — automated session cleanup entries (logged under system actor)</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Each Log Entry Shows</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Action type (color-coded — refunds in orange, restrictions in red, others in muted)</li>
                  <li>Severity badge (critical, warning, info)</li>
                  <li>Timestamp</li>
                  <li>Which admin performed the action</li>
                  <li>Which user was affected (linked to their profile)</li>
                  <li>Metadata — inline details like &quot;new_status: restricted · reason: spam&quot;</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">How to Use It</p>
                <p className="text-xs text-white/70">
                  This page is <strong className="text-white">view-only</strong>. You cannot edit or delete log entries — this is by design.
                  The audit trail is permanent. Use it to verify what happened, investigate issues, or review another admin&apos;s actions.
                  The page refreshes every 10 seconds and shows the 100 most recent entries.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Every action you take is logged here permanently. Always include a reason when restricting, 
                  suspending, or closing accounts — the reason is stored in the log.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "💰 Transactions — Financial Records",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Transactions page shows the platform&apos;s financial ledger — every tip, withdrawal, refund, 
                  dispute, and payout recorded in the system. This is the source of truth for money movement.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What You See</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Transaction type (color-coded: tips in green, refunds/disputes in red, withdrawals/payouts in orange, card charges in blue)</li>
                  <li>Timestamp</li>
                  <li>User (linked to their admin profile)</li>
                  <li>Reference ID</li>
                  <li>Status (if applicable)</li>
                  <li>Amount — positive amounts in green with a + sign, negative in red</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Filter by Type</p>
                <p className="text-xs text-white/70 mb-1">Use the dropdown to filter:</p>
                <div className="flex flex-wrap gap-1">
                  {["All", "tip_received", "tip_refunded", "withdrawal", "payout", "card_charge", "card_refund", "dispute", "adjustment"].map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-white/5 text-white/50">{t}</span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Search</p>
                <p className="text-xs text-white/70">
                  The search box checks user IDs, reference IDs, ledger IDs, and metadata. 
                  Use it to find a specific transaction by any known identifier.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What You Can Do</p>
                <p className="text-xs text-white/70">
                  This page is <strong className="text-white">view-only</strong>. You can browse and search transactions, 
                  but refunds and other actions are taken from the user&apos;s detail page — not here.
                </p>
              </div>

              <div className="bg-white/5 rounded-lg p-3 mt-1">
                <p className="text-xs font-medium text-white mb-1">Revenue Page (separate)</p>
                <p className="text-xs text-white/60">
                  Owner and Super Admin also have access to the Revenue page, which shows KPI cards 
                  (total revenue, Stripe fees, refunds, velocity, average tip size, refund rate), 
                  daily revenue charts, top earners, anomaly alerts, and real-time toast notifications 
                  for new tips and refunds. Revenue data auto-refreshes every 15 seconds.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Transactions are immutable records. They cannot be edited or deleted. 
                  If a tip needs to be reversed, process a refund through the user&apos;s profile.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "👤 Users — Accounts & Profile Cards",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Users page lists every user on the platform. You can search by handle, name, or user ID, 
                  and filter by account status. Click any user to open their full detail page — the &quot;Profile Card.&quot;
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">User List</p>
                <p className="text-xs text-white/70 mb-1">Each user card on the list shows:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Display name and @handle</li>
                  <li>User ID (truncated)</li>
                  <li>Account status badge (green = active, yellow = restricted, orange = suspended, gray = closed)</li>
                  <li>Owed balance in red (if they owe money)</li>
                  <li>FLAGGED badge (if at risk or manually flagged)</li>
                </ul>
                <p className="text-xs text-white/70 mt-2">Quick actions on each card: set status to Active, Restricted, Suspended, or Closed. 
                  Destructive actions (Restrict, Suspend, Close) require a confirmation modal with a mandatory reason.</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-2">The User Profile Card (Detail Page)</p>
                <p className="text-xs text-white/70 mb-2">
                  This is the most important page you will use. When you click into a user, you see their entire account 
                  in one place. Here is everything on it, section by section:
                </p>

                <div className="space-y-2">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-xs font-medium text-red-400 mb-1">⚠ Risk Banner (top of page, conditional)</p>
                    <p className="text-xs text-white/60">
                      Only appears when something is wrong — account is not active, has owed balance, 
                      has disputes, or is manually flagged. Lists all risk factors on one line.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Info Cards (3 across)</p>
                    <ul className="text-xs text-white/60 space-y-1">
                      <li><strong className="text-blue-400">Account</strong> — @handle, user ID, join date, role, status, status reason</li>
                      <li><strong className="text-emerald-400">Balance</strong> — wallet balance (green if positive, red if negative), owed balance</li>
                      <li><strong className="text-amber-400">Risk</strong> — risk level (LOW/MEDIUM/HIGH), dispute count, flagged indicator</li>
                    </ul>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Actions Section</p>
                    <p className="text-xs text-white/60 mb-1">Status change buttons: Active, Restricted, Suspended, Closed.</p>
                    <ul className="text-xs text-white/60 space-y-1">
                      <li><strong className="text-yellow-400">Restrict</strong> — confirmation modal with reason + optional auto-unlock timer (24h, 72h, 7d, 30d, or permanent). After 3+ restrictions, permanent is forced automatically.</li>
                      <li><strong className="text-orange-400">Suspend / Close</strong> — confirmation modal with reason + you must type &quot;SUSPENDED&quot; or &quot;CLOSED&quot; to confirm.</li>
                      <li>AI warnings appear in the modal based on risk level, dispute count, flags, and owed balance.</li>
                    </ul>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Risk Engine</p>
                    <p className="text-xs text-white/60">
                      &quot;Run Risk Evaluation&quot; button — triggers the automated risk rules manually. 
                      Shows either &quot;Account auto-restricted&quot; with the rules that fired, or &quot;No risk rules triggered — account clear.&quot;
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Refund Approvals</p>
                    <p className="text-xs text-white/60">
                      Any pending refund requests for this user. Shows amount, tip ID, reason, approval votes, 
                      and Approve/Reject buttons. High-value refunds require owner approval.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Tips</p>
                    <p className="text-xs text-white/60">
                      All successful tips for this user (up to 50). Each has a Refund button that opens a modal 
                      where you select a reason (User Request, Fraud, Duplicate, Chargeback Prevention, Admin Error) 
                      and add an optional note.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Transaction History</p>
                    <p className="text-xs text-white/60">
                      All ledger entries for this user — tips, refunds, payouts, disputes — color-coded and chronological.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Activity Timeline</p>
                    <p className="text-xs text-white/60">
                      A merged chronological log of all admin actions, transactions, and internal notes for this specific user. 
                      Shows who did what, when, and with what amount.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Support History</p>
                    <p className="text-xs text-white/60">
                      AI-summarized past support interactions. Shows outcome (Resolved/Unresolved), 
                      issue type, date, summary, and links to the original ticket.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-white mb-1">Support Notes</p>
                    <p className="text-xs text-white/60">
                      Internal notes that admins leave on a user&apos;s profile. Only visible to admins. 
                      Add notes to share context with other team members.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Account Status Flow</p>
                <div className="bg-white/5 rounded-lg p-3 text-xs text-white/60 space-y-1">
                  <p><strong className="text-emerald-400">Active</strong> → can be restricted, suspended, or closed</p>
                  <p><strong className="text-yellow-400">Restricted</strong> → can be set to active, suspended, or closed. May have an auto-unlock timer. 3+ restrictions = permanent.</p>
                  <p><strong className="text-orange-400">Suspended</strong> → can be set to active, restricted, or closed</p>
                  <p><strong className="text-white/40">Closed</strong> → can still be changed to other statuses if needed</p>
                  <p className="text-white/50 mt-1">All status changes require a reason, are permanently logged, and notify the user via email and in-app notification.</p>
                </div>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ The Profile Card is your command center for any user issue. Before taking any action, 
                  always check the Risk Banner, owed balance, dispute count, and activity timeline first.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "🏠 Dashboard — Command Center",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Dashboard is the first page you see after logging in. It gives you a real-time snapshot 
                  of the entire platform in one place — user counts, financial health, support load, risk alerts, and recent activity.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Top Stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-white">Total Users</p>
                    <p className="text-xs text-white/50">Total profiles on the platform</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-amber-400">Restricted / Suspended</p>
                    <p className="text-xs text-white/50">Users currently in a restricted or suspended state</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-orange-400">Pending Refunds</p>
                    <p className="text-xs text-white/50">Refunds submitted but not yet confirmed by Stripe</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-red-400">Active Disputes</p>
                    <p className="text-xs text-white/50">Tips currently under chargeback</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">System Alerts</p>
                <p className="text-xs text-white/70 mb-1">Auto-generated warnings based on current platform state:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>🔴 Critical if 3+ disputes in the last hour</li>
                  <li>⚠️ Warning if any disputes in the last hour</li>
                  <li>⚠️ Warning if refunds are stuck (initiated &gt;10 min)</li>
                  <li>🔴 Critical if total owed balances exceed $100</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Support Overview</p>
                <p className="text-xs text-white/70">
                  Three cards showing pending tickets, active chats, and waiting chats. 
                  If waiting chats is above zero, it is highlighted yellow — users need help now.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Risk Alerts</p>
                <p className="text-xs text-white/70">
                  Unresolved risk alerts with severity badges, messages, and links to the affected user. 
                  You can dismiss individual alerts once reviewed.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Panic Button</p>
                <p className="text-xs text-white/70">
                  &quot;Emergency: Restrict All Flagged Users&quot; — immediately restricts every user 
                  with an owed balance or active dispute. Requires confirmation. Use only in emergencies.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Check the dashboard at the start of every shift. If system alerts are red, handle them first.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "✅ Approvals — Refund Voting",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  Refunds over $100 do not execute immediately. Instead, they go to the Approvals page 
                  and require <strong className="text-white">2 admin votes</strong> before they process. 
                  Refunds over $350 additionally require that at least one approver is the <strong className="text-white">Owner</strong>.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">How It Works</p>
                <ol className="list-decimal pl-5 text-xs text-white/60 space-y-1">
                  <li>An admin initiates a refund from the Refunds page or a user&apos;s profile</li>
                  <li>If the amount is over $100, the refund enters &quot;Pending Approval&quot;</li>
                  <li>The request appears on the Approvals page for all admins with refund permission</li>
                  <li>Two different admins must approve (you cannot approve your own request)</li>
                  <li>Once the vote threshold is met, the refund executes automatically via Stripe</li>
                </ol>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What You See</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Dollar amount and &quot;Owner required&quot; badge (if over $350)</li>
                  <li>Who requested it, when, and the reason</li>
                  <li>Vote progress bar (e.g., 1/2 approvals)</li>
                  <li>Who already voted</li>
                  <li>&quot;Needs your approval&quot; filter to see only items you haven&apos;t voted on</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Your Actions</p>
                <ul className="text-xs text-white/60 space-y-1">
                  <li><strong className="text-emerald-400">Approve</strong> — cast your vote. If this completes the threshold, the refund processes immediately.</li>
                  <li><strong className="text-red-400">Reject</strong> — requires a written reason. Kills the request immediately.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Review the reason and amount carefully before approving. You cannot undo an executed refund. 
                  If an approval over $350 is waiting, only the Owner can unblock it.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "💸 Refunds — Processing & Retries",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Refunds page shows every tip that has had refund activity — whether initiated, partially refunded, 
                  or fully refunded. This is where you start refunds and retry stuck ones.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Refund Statuses</p>
                <div className="rounded-lg overflow-hidden border border-white/10 mt-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Status</th>
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Meaning</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/70">
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2"><span className="text-orange-400 font-medium">Initiated</span></td>
                        <td className="px-3 py-2">Sent to Stripe, waiting for confirmation</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2"><span className="text-yellow-400 font-medium">Partial</span></td>
                        <td className="px-3 py-2">Some amount refunded, but not the full tip</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2"><span className="text-emerald-400 font-medium">Full</span></td>
                        <td className="px-3 py-2">Entire tip amount has been refunded</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Your Actions</p>
                <ul className="text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">Initiate Refund</strong> — starts a refund via Stripe. If the user&apos;s wallet balance is less than the refund amount, 
                    a warning shows that this will result in a negative balance — you must confirm.</li>
                  <li><strong className="text-white">Retry</strong> — appears on stuck refunds (initiated &gt;10 min). Re-sends to Stripe.</li>
                </ul>
                <p className="text-xs text-white/50 mt-1">Rate limited: max 3 refund actions per minute per admin.</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Approval Flow</p>
                <p className="text-xs text-white/70">
                  Refunds ≤$100 execute instantly. Refunds &gt;$100 go to the Approvals page and need 2 votes. 
                  Refunds &gt;$350 require at least one Owner vote. A reason is always required.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ If a refund shows &quot;stale&quot; (stuck in initiated), try the Retry button first. 
                  If it still fails, check the Stripe Dashboard for the PaymentIntent status.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "🔐 Overrides — Audit Trail",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Overrides page is a read-only audit log of all privileged admin overrides — 
                  actions that bypass normal system rules. Every override is recorded permanently.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Override Types</p>
                <div className="space-y-1 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">Withdrawal Limit → Unlimited</span>
                    <span className="text-xs text-white/50">Removes the withdrawal cap for a user</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">Unlock Withdrawal</span>
                    <span className="text-xs text-white/50">Clears a withdrawal hold on a user</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Unflag / Clear Restriction</span>
                    <span className="text-xs text-white/50">Removes a flag or restriction from a user</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">Bypass Verification</span>
                    <span className="text-xs text-white/50">Skips verification requirements</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">Reset Risk Score</span>
                    <span className="text-xs text-white/50">Resets a user&apos;s fraud risk score</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">Manual Flag</span>
                    <span className="text-xs text-white/50">Manually flags a user for review</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What You See</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Type badge (color-coded)</li>
                  <li>Which admin performed the override → which user was affected</li>
                  <li>Reason text and timestamp</li>
                  <li>Expandable detail: before/after JSON snapshots showing exactly what changed</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Filtering</p>
                <p className="text-xs text-white/70">
                  Filter by override type using the dropdown. Paginated at 25 per page.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ This page is view-only. Overrides are performed from user profile pages, not here. 
                  Use this page to audit what overrides have been made and by whom.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "📈 Revenue — Financial Dashboard",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Revenue page is the financial command center. It shows real-time earnings, trends, 
                  anomaly alerts, and daily breakdowns. Only <strong className="text-white">Owner</strong> and <strong className="text-white">Super Admin</strong> can access this page.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Hero Strip (always visible)</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-emerald-400">Today&apos;s Revenue</strong> — platform fees earned since midnight</li>
                  <li><strong className="text-blue-400">Velocity</strong> — dollars per hour rate (glows green when tips come in)</li>
                  <li><strong className="text-white">Trend Signal</strong> — Growing / Stable / Volatile with reason on hover</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Anomaly Alerts</p>
                <p className="text-xs text-white/70 mb-1">Auto-detected financial anomalies:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>🔴 Revenue spike — today is &gt;2x yesterday&apos;s total</li>
                  <li>🟡 High refund rate — &gt;10% is a warning, &gt;20% is critical</li>
                  <li>🟡 Unusual refund volume — 5+ refunds today</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Data Sections</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">KPI Bar</strong> — average tip size, total tip count, refund rate %</li>
                  <li><strong className="text-white">Revenue Cards</strong> — total revenue, total volume, Stripe fees, refunds, today/yesterday/week/month comparisons</li>
                  <li><strong className="text-white">Top Earners</strong> — highest-earning creators</li>
                  <li><strong className="text-white">Daily Breakdown</strong> — per-day cards showing volume, platform fees, Stripe fees, and net revenue</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Time Ranges</p>
                <p className="text-xs text-white/70">
                  Toggle between <strong className="text-white">7 days</strong>, <strong className="text-white">30 days</strong>, and <strong className="text-white">90 days</strong>. 
                  The system recommends the best range based on which period shows the strongest growth.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Revenue refreshes every 15 seconds. Watch anomaly alerts closely — a revenue spike 
                  could mean a viral moment, but a high refund rate could mean fraud.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "👥 Staff — Team Management",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Staff page shows all admin team members. The Owner can manage, restrict, suspend, or terminate 
                  staff from here. Each staff member has a full detail page with performance metrics, risk scores, 
                  and a discipline record.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Staff List</p>
                <p className="text-xs text-white/70 mb-1">Each admin card shows:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>Name, role, and custom admin ID</li>
                  <li>Status (active, restricted, suspended, or terminated)</li>
                  <li>Last login time and total action count</li>
                  <li>Last action taken (description + time)</li>
                  <li>Availability: online 🟢 / busy 🟡 / offline ⚫</li>
                  <li>Risk score badge (for non-owners): low / medium / high / critical</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Owner Actions (on staff cards)</p>
                <ul className="text-xs text-white/60 space-y-1">
                  <li><strong className="text-yellow-400">Restrict</strong> — view-only mode for 1 hour, 24 hours, or 7 days</li>
                  <li><strong className="text-orange-400">Suspend</strong> — blocks login entirely (type &quot;SUSPEND&quot; to confirm)</li>
                  <li><strong className="text-emerald-400">Reactivate</strong> — restores access for restricted or suspended admins</li>
                </ul>
                <p className="text-xs text-white/50 mt-1">All actions require a written reason.</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Staff Detail Page</p>
                <p className="text-xs text-white/70 mb-1">Click into any admin to see:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">Stats</strong> — actions today, total actions, restrictions issued, overrides count</li>
                  <li><strong className="text-white">Performance</strong> — actions/week, avg actions/day, tickets resolved, critical actions this week</li>
                  <li><strong className="text-white">Risk Assessment</strong> (owner-only) — score out of 100, risk level, and itemized risk factors with point values</li>
                  <li><strong className="text-white">Control Panel</strong> (owner-only) — restrict, suspend, terminate, or reactivate</li>
                  <li><strong className="text-white">Discipline Record</strong> — all staff tickets (warnings, policy violations, performance reviews)</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Discipline Tickets</p>
                <p className="text-xs text-white/70 mb-1">
                  Staff tickets are internal disciplinary records. Types:
                </p>
                <div className="flex flex-wrap gap-1">
                  {["Warning", "Performance Review", "Policy Violation", "Escalation", "Note"].map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-white/5 text-white/50">{t}</span>
                  ))}
                </div>
                <p className="text-xs text-white/70 mt-2">
                  Owners can send tickets to any staff member. Super Admins can send to regular admins. 
                  Recipients can acknowledge and resolve them. Some tickets are auto-generated by the risk engine.
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Staff risk scores are monitored automatically. If an admin shows rapid unusual activity 
                  (override storms, mass restrictions), the system generates auto-tickets and alerts the Owner.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "🎫 Tickets — Async Support",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  Tickets are async support requests — different from live chat. Users submit a ticket with a subject and message, 
                  and admins respond in a threaded conversation. Tickets can also be created automatically when a live chat is escalated.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Ticket Statuses</p>
                <div className="space-y-2 mt-1">
                  <div className="flex items-start gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">OPEN</span>
                    <p className="text-xs text-white/60">New ticket, not yet picked up by an admin.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">IN PROGRESS</span>
                    <p className="text-xs text-white/60">An admin is working on it.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">RESOLVED</span>
                    <p className="text-xs text-white/60">Issue handled — admin marked it resolved.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/40">CLOSED</span>
                    <p className="text-xs text-white/60">Permanently closed (auto or manual).</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Ticket Detail View</p>
                <p className="text-xs text-white/70 mb-1">Clicking into a ticket shows:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">Thread</strong> — chat-style messages from user (gray), admin (blue), internal notes (amber), and system (centered)</li>
                  <li><strong className="text-white">User Card</strong> — sidebar with user&apos;s profile, risk level, total tickets, resolution rate, dispute count, account status</li>
                  <li><strong className="text-white">Thread Summary</strong> — age, breach count, priority, message counts, SLA status</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Your Actions</p>
                <ul className="text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">Reply</strong> — text with optional file upload (max 10 MB). Toggle &quot;internal note&quot; for admin-only messages.</li>
                  <li><strong className="text-white">Quick Macros</strong> — pre-written responses: &quot;Check wallet&quot;, &quot;Issue resolved&quot;, &quot;Need more info&quot;, &quot;Processing time&quot;, &quot;Escalated&quot;</li>
                  <li><strong className="text-white">AI Suggestions</strong> — generate AI reply suggestions based on the conversation</li>
                  <li><strong className="text-white">Status Change</strong> — set to open, in progress, resolved, or closed</li>
                  <li><strong className="text-white">Take Over</strong> — assign yourself when the ticket is unassigned</li>
                  <li><strong className="text-white">Convert to Chat</strong> — opens or reopens a live chat session for this user</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">SLA Escalation (automatic)</p>
                <p className="text-xs text-white/70 mb-1">If a ticket isn&apos;t handled in time, the system escalates automatically:</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">15 min before deadline</strong> — reminder sent to assigned admin</li>
                  <li><strong className="text-amber-400">1st breach</strong> — notify assigned admin, escalate priority</li>
                  <li><strong className="text-orange-400">2nd breach</strong> — notify ALL admins</li>
                  <li><strong className="text-red-400">3rd+ breach</strong> — notify Owner, auto-reassign to lowest-load admin</li>
                  <li><strong className="text-white/40">5 days no reply</strong> — auto-close warning sent to user</li>
                  <li><strong className="text-white/40">6 days</strong> — ticket auto-closed</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Watch the &quot;Needs reply&quot; badge — it means the user is waiting on you. 
                  SLA breaches are tracked and affect your performance metrics on the Staff page.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "🪪 Verifications — KYC Document Review",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  Users who are restricted or flagged may be asked to verify their identity by uploading a government ID 
                  (ID card, passport, or driver&apos;s license). Submitted documents appear on the Verifications page 
                  for admin review.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">What You See</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li>User avatar, name, and email (linked to their admin profile)</li>
                  <li>Document type (ID Card / Passport / Driver&apos;s License)</li>
                  <li>Front and back images (click to view full-screen)</li>
                  <li>AI-extracted data (OCR): full name, date of birth, ID number</li>
                  <li>Match score — how well the document data matches their profile</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Match Score Guidance</p>
                <div className="rounded-lg overflow-hidden border border-white/10 mt-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Score</th>
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Label</th>
                        <th className="text-left px-3 py-2 text-white/50 font-medium">Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/70">
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2 text-emerald-400 font-medium">&gt;80%</td>
                        <td className="px-3 py-2">High confidence</td>
                        <td className="px-3 py-2">✓ Recommended to approve</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2 text-amber-400 font-medium">50–80%</td>
                        <td className="px-3 py-2">Partial match</td>
                        <td className="px-3 py-2">⚠ Needs manual review</td>
                      </tr>
                      <tr className="border-t border-white/5">
                        <td className="px-3 py-2 text-red-400 font-medium">&lt;50%</td>
                        <td className="px-3 py-2">Low match</td>
                        <td className="px-3 py-2">✕ Likely reject — names don&apos;t match</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Your Actions</p>
                <ul className="text-xs text-white/60 space-y-1">
                  <li><strong className="text-emerald-400">Approve</strong> — sets account to active, marks user as verified. 
                    The user gets a &quot;Identity Verified ✔&quot; notification and restrictions are cleared.</li>
                  <li><strong className="text-red-400">Reject</strong> — requires a reason (e.g., &quot;Document blurry&quot;, &quot;Name doesn&apos;t match&quot;). 
                    Account stays restricted, restriction count increases. User is told they can resubmit.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ Always compare the OCR-extracted name with the profile name. A high match score means the AI 
                  is confident, but you should still visually verify the document looks legitimate.
                </p>
              </div>
            </div>
          ),
        },
        {
          title: "📉 Support Analytics — Metrics",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-white mb-1">Overview</p>
                <p className="text-xs text-white/70">
                  The Support Analytics page shows performance metrics for the live chat support system. 
                  Use it to track team efficiency, identify bottlenecks, and see who is handling the most sessions.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Top KPIs</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-white">Total Sessions</p>
                    <p className="text-xs text-white/50">All-time support session count</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-blue-400">Today</p>
                    <p className="text-xs text-white/50">Sessions started today</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-amber-400">Avg Response</p>
                    <p className="text-xs text-white/50">Time to first admin reply</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-xs font-medium text-emerald-400">Avg Resolution</p>
                    <p className="text-xs text-white/50">Average session duration</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">AI vs Human (30-day)</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">AI Handled</strong> — sessions fully resolved by the AI assistant</li>
                  <li><strong className="text-white">Human Handled</strong> — sessions with admin involvement</li>
                  <li><strong className="text-white">AI → Human</strong> — sessions that started with AI but escalated to a human</li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-1">Charts & Leaderboards</p>
                <ul className="list-disc pl-5 text-xs text-white/60 space-y-1">
                  <li><strong className="text-white">Session Trend</strong> — area chart of sessions per day over 30 days</li>
                  <li><strong className="text-white">Close Reasons</strong> — bar chart: Admin / User / System with percentages</li>
                  <li><strong className="text-white">Top Agents</strong> — ranked list by session count + avg duration. #1 gets gold highlight.</li>
                </ul>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-amber-400">
                  ⚠️ If &quot;AI → Human&quot; conversions are high, the AI assistant may need better training data. 
                  If average response time is climbing, more admins need to be in the Support Queue.
                </p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      label: "Training",
      emoji: "📚",
      sections: [
    {
      title: "🎫 Tickets & Support",
      content: (
        <>
          <p className="mb-2">Handle user issues through structured tickets.</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-white/70">
            <li>Respond within SLA time</li>
            <li>Use AI suggestions when helpful</li>
            <li>Always provide clear answers</li>
            <li>Mark tickets resolved only when issue is fully handled</li>
          </ul>

          <div className="mt-3 text-xs text-amber-400">
            ⚠️ Do not close tickets without confirmation if issue is unclear
          </div>
        </>
      ),
    },
    {
      title: "💬 Live Support Chat",
      content: (
        <>
          <ul className="list-disc pl-5 space-y-1 text-sm text-white/70">
            <li>AI handles first response when available</li>
            <li>Take over chats when needed</li>
            <li>Transfer chats if another admin is better suited</li>
            <li>Keep responses short and professional</li>
          </ul>

          <div className="mt-3 text-xs text-amber-400">
            ⚠️ Escalate payment or fraud-related issues immediately
          </div>
        </>
      ),
    },
    {
      title: "🚨 Fraud & Risk System",
      content: (
        <>
          <p className="text-sm text-white/70 mb-2">
            Fraud system assigns a score based on behavior and AI analysis.
          </p>

          <ul className="list-disc pl-5 space-y-1 text-sm text-white/70">
            <li>Low risk → allow</li>
            <li>Medium risk → review</li>
            <li>High risk → restrict</li>
          </ul>

          <div className="mt-3 text-xs text-amber-400">
            ⚠️ Do not override fraud decisions unless confident
          </div>
        </>
      ),
    },
    {
      title: "👤 User Management",
      content: (
        <>
          <ul className="list-disc pl-5 space-y-1 text-sm text-white/70">
            <li><strong>Restrict:</strong> Temporary issue (verification required)</li>
            <li><strong>Suspend:</strong> Serious violation</li>
            <li><strong>Close:</strong> Permanent action</li>
            <li>Always include a reason when taking action</li>
          </ul>

          <div className="mt-3 text-xs text-amber-400">
            ⚠️ Never take action without documenting the reason
          </div>
        </>
      ),
    },
    {
      title: "💸 Payments & Withdrawals",
      content: (
        <>
          <ul className="list-disc pl-5 space-y-1 text-sm text-white/70">
            <li>Check account status before assisting</li>
            <li>Verify Stripe onboarding status</li>
            <li>Guide users — do not promise outcomes</li>
            <li>Escalate unusual payment behavior</li>
          </ul>

          <div className="mt-3 text-xs text-amber-400">
            ⚠️ Never guarantee refunds or payouts
          </div>
        </>
      ),
    },
    {
      title: "🧑‍⚖️ Admin Rules & SOP",
      content: (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-white mb-1">Core Principle</p>
            <p className="text-xs text-white/70">
              AI assists. Humans decide. You are responsible for every action taken.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">Decision Authority</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Review all AI suggestions before acting</li>
              <li>✔ Make final decisions yourself</li>
              <li>❌ Do not blindly follow AI responses</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">Support Responses</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Be clear, professional, and helpful</li>
              <li>✔ Answer the user's question directly</li>
              <li>✔ Review replies before sending</li>
              <li>❌ Do not guess or provide false information</li>
              <li>❌ Do not promise payouts or refunds</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">Account Actions</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Always check user history and signals</li>
              <li>✔ Confirm a valid reason before acting</li>
              <li>✔ Read warnings carefully</li>
              <li>❌ Do not take action based only on AI</li>
              <li>❌ Do not act without a reason</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">AI Usage</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Use AI for suggestions and explanations</li>
              <li>✔ Edit AI-generated replies if needed</li>
              <li>❌ Do not rely on AI to make decisions</li>
              <li>❌ Do not let AI replace your judgment</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">Data & Privacy</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Keep user information private</li>
              <li>✔ Share only necessary information</li>
              <li>❌ Never expose emails, payment info, or IDs</li>
              <li>❌ Never reveal internal system logic</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">Fraud & Risk</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Review high-risk users carefully</li>
              <li>✔ Use &quot;review&quot; when unsure</li>
              <li>✔ Escalate serious cases</li>
              <li>❌ Do not ignore warnings</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">Escalation</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Escalate financial or fraud-related issues</li>
              <li>✔ Escalate when unsure</li>
              <li>❌ Do not guess in complex situations</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white mb-1">Response Time (SLA)</p>
            <ul className="text-xs text-white/70 space-y-1">
              <li>✔ Respond within required time</li>
              <li>✔ Prioritize urgent tickets</li>
              <li>❌ Do not leave tickets unanswered</li>
            </ul>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-sm font-semibold text-white mb-1">Final Rule</p>
            <p className="text-xs text-white/70">
              AI helps you work faster. You are responsible for working correctly.
            </p>
          </div>
        </div>
      ),
    },
      ],
    },
  ]

  // Flatten categories into indexable sections
  const allSections: { catIdx: number; secIdx: number; section: Section; catLabel: string; catEmoji: string }[] = []
  categories.forEach((cat, ci) => {
    cat.sections.forEach((sec, si) => {
      allSections.push({ catIdx: ci, secIdx: si, section: sec, catLabel: cat.label, catEmoji: cat.emoji })
    })
  })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-24">
      
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">
            Admin Training Center
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Welcome to 1neLink admin training. Learn how to manage users, support requests, and platform safety.
          </p>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
        <p className="text-sm text-amber-400 font-medium mb-2">
          ⚡ Quick Tips
        </p>
        <ul className="text-xs text-amber-300 space-y-1">
          <li>• Always include a reason when restricting accounts</li>
          <li>• Do not guess answers — escalate if unsure</li>
          <li>• Never promise refunds or payouts</li>
        </ul>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {categories.map((cat, ci) => (
          <div key={ci}>
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3">
              {cat.emoji} {cat.label}
            </h2>
            <div className="space-y-3">
              {cat.sections.map((section, si) => {
                const key = `${ci}-${si}`
                return (
                  <div
                    key={key}
                    className="border border-white/10 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setOpenIndex(openIndex === key ? null : key)
                      }
                      className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 transition flex justify-between items-center"
                    >
                      <span className="text-sm font-medium text-white">
                        {section.title}
                      </span>
                      <span className="text-white/40 text-xs">
                        {openIndex === key ? "−" : "+"}
                      </span>
                    </button>

                    {openIndex === key && (
                      <div className="px-4 py-3 bg-black/30">
                        {section.content}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Do / Don't */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-sm text-emerald-400 font-medium mb-2">✔ Do</p>
          <ul className="text-xs text-emerald-300 space-y-1">
            <li>• Be clear and professional</li>
            <li>• Use system tools properly</li>
            <li>• Escalate when needed</li>
          </ul>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-sm text-red-400 font-medium mb-2">❌ Don't</p>
          <ul className="text-xs text-red-300 space-y-1">
            <li>• Guess answers</li>
            <li>• Ignore fraud alerts</li>
            <li>• Take action without reason</li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-xs text-white/30 text-center">
        1neLink Admin Guide • Internal Use Only
      </div>
    </div>
  )
}
