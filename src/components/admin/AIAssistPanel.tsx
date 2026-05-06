"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { isAIAssistMode } from "@/lib/aiAssistMode"
import { getSuggestion, getWarnings } from "@/lib/adminSuggestionEngine"
import { handleSmartFallback } from "@/lib/aiFallback"
import { getAdminHeaders } from "@/lib/auth/adminSession"

type Message = { role: "user" | "ai"; text: string; action?: { label: string; route: string } }

const pageLabels: Record<string, string> = {
  "/admin": "Dashboard Overview",
  "/admin/users": "Users",
  "/admin/tickets": "Tickets",
  "/admin/transactions": "Transactions",
  "/admin/refunds": "Refunds",
  "/admin/disputes": "Disputes",
  "/admin/fraud": "Fraud Detection",
  "/admin/support": "Support Sessions",
  "/admin/support/analytics": "Support Analytics",
  "/admin/revenue": "Revenue",
  "/admin/approvals": "Approvals",
  "/admin/verifications": "Verifications",
  "/admin/logs": "Audit Logs",
  "/admin/activity": "Activity Feed",
  "/admin/activity-calendar": "Activity Calendar",
  "/admin/guide": "Admin Guide",
  "/admin/staff": "Staff",
  "/admin/staff/tickets": "Discipline",
  "/admin/payroll": "Payroll",
  "/admin/applicants": "Applicants",
  "/admin/interviews": "Interview Calendar",
  "/admin/overrides": "Overrides",
  "/admin/owner-ai": "Owner AI",
  "/admin/creator-applications": "Creator Applications",
  "/admin/creators": "Elite Applications",
  "/admin/store-hero": "Store Hero Ads",
  "/admin/notifications": "Notifications",
}

function getPageLabel(pathname: string): string {
  if (pageLabels[pathname]) return pageLabels[pathname]
  // Check prefix matches for sub-routes
  for (const [route, label] of Object.entries(pageLabels)) {
    if (pathname.startsWith(route + "/")) return label
  }
  return "Admin"
}

const quickQuestions = [
  "When should I restrict a user?",
  "How do I handle a dispute?",
  "What should I check first?",
  "Explain this page",
]

export default function AIAssistPanel() {
  const pathname = usePathname()
  const router = useRouter()
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [pageContext, setPageContext] = useState<Record<string, unknown>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync toggle state
  useEffect(() => {
    setEnabled(isAIAssistMode())
    const handler = () => {
      const on = isAIAssistMode()
      setEnabled(on)
      if (!on) {
        setOpen(false)
        setMessages([])
      }
    }
    window.addEventListener("aiAssistModeChange", handler)
    return () => window.removeEventListener("aiAssistModeChange", handler)
  }, [])

  // Auto-suggestion on page change
  useEffect(() => {
    if (!enabled) return

    const suggestionMap: Record<string, string> = {
      "/admin": "Welcome to the dashboard. Check risk alerts and active disputes first.",
      "/admin/tickets": "Check SLA timers and respond to the oldest open tickets first.",
      "/admin/users": "Review user status and recent activity before taking actions.",
      "/admin/fraud": "Review flagged accounts carefully. High-score anomalies need immediate attention.",
      "/admin/disputes": "Disputes must be responded to within 7 days. Gather evidence early.",
      "/admin/refunds": "Verify the reason and receipt before approving any refund.",
      "/admin/support": "Prioritize waiting customers over idle sessions.",
      "/admin/transactions": "Use filters to find specific transactions. Watch for unusual patterns.",
      "/admin/revenue": "Review trends and check for unexpected volume changes.",
      "/admin/verifications": "Cross-check submitted documents against user profile data.",
      "/admin/activity": "Review recent admin actions. Look for unusual patterns.",
      "/admin/activity-calendar": "View scheduled activity across shifts and time ranges.",
      "/admin/staff": "Manage team roles and permissions here.",
      "/admin/staff/tickets": "Disciplinary records — document thoroughly before submitting.",
      "/admin/payroll": "Review staff hours and compensation before processing.",
      "/admin/applicants": "Use the kanban board to move candidates through the hiring pipeline.",
      "/admin/interviews": "Check upcoming interviews and confirm all invite links are sent.",
      "/admin/overrides": "Manual overrides bypass normal limits — document your reason carefully.",
      "/admin/owner-ai": "High-level business insights — all queries are logged.",
      "/admin/creator-applications": "Review creator upgrade requests. Check profile quality before approving.",
      "/admin/creators": "Elite tier requires high standards — review earnings and content quality.",
      "/admin/store-hero": "Verify ad content and expiry dates before publishing hero slots.",
      "/admin/notifications": "Broadcast reaches all users — double-check content before sending.",
      "/admin/support/analytics": "Use SLA trends to identify understaffed support periods.",
    }

    const autoMsg = suggestionMap[pathname]
    if (autoMsg) {
      setMessages([{ role: "ai", text: autoMsg }])
    } else {
      setMessages([])
    }
    setPageContext({})
  }, [pathname, enabled])

  // Listen for page context data from admin pages
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && typeof detail === "object") {
        setPageContext(detail)
      }
    }
    window.addEventListener("aiAssistContext", handler)
    return () => window.removeEventListener("aiAssistContext", handler)
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const getAdminSession = useCallback(() => {
    try {
      const raw = localStorage.getItem("admin_session")
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const session = getAdminSession()
    if (!session?.admin_id) return

    const userMsg: Message = { role: "user", text: text.trim() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/ai-assist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.text,
          })),
          context: {
            page: pathname,
            admin_role: session.role,
            data: pageContext,
          },
        }),
      })

      if (!res.ok) {
        // Try to read error body for specific messages
        const errBody = await res.json().catch(() => null)
        if (res.status === 401) {
          throw new Error("Your admin session has expired. Please log in again.")
        }
        if (res.status === 429 && errBody?.reply) {
          setMessages((prev) => [...prev, { role: "ai", text: errBody.reply }])
          return
        }
        throw new Error(errBody?.error || "Failed")
      }

      const data = await res.json()
      setMessages((prev) => [...prev, {
        role: "ai",
        text: data.reply,
        ...(data.action && { action: data.action }),
      }])
    } catch (err) {
      // Client-side smart fallback with error context
      const errMsg = err instanceof Error ? err.message : ""
      if (errMsg.includes("session has expired")) {
        setMessages((prev) => [...prev, { role: "ai", text: errMsg }])
      } else {
        const fallback = handleSmartFallback({ message: text.trim(), currentPage: pathname })
        setMessages((prev) => [...prev, {
          role: "ai",
          text: fallback.text,
          ...(fallback.action && { action: fallback.action }),
        }])
      }
    } finally {
      setLoading(false)
    }
  }, [loading, pathname, pageContext, getAdminSession])

  if (!enabled) return null

  const ctx = { page: pathname, admin_role: getAdminSession()?.role, data: pageContext }
  const suggestion = getSuggestion(ctx)
  const warnings = getWarnings(ctx)

  const severityColors = {
    info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    warn: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    danger: "text-red-400 bg-red-500/10 border-red-500/20",
  }

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          aria-label="Open AI Assistant"
        >
          <span className="text-2xl">🧠</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[600px] bg-black border border-white/[0.12] rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.12] bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧠</span>
              <div>
                <div className="text-sm font-semibold text-white">AI Assistant</div>
                <div className="text-[10px] text-white/55">Suggestions only — no actions taken</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/55 hover:text-white text-lg px-2 py-1 transition"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Context header */}
          <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
            <div className="text-[11px] text-white/55">
              You are viewing: <span className="text-white/70 font-medium">{getPageLabel(pathname)}</span>
            </div>
          </div>

          {/* Content area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[380px]">
            {/* Warnings */}
            {warnings.map((w, i) => (
              <div key={`warn-${i}`} className="text-xs px-3 py-2 rounded-lg border bg-red-500/10 border-red-500/20 text-red-400">
                {w}
              </div>
            ))}

            {/* Suggestion */}
            {suggestion && messages.length === 0 && (
              <div className={`text-xs px-3 py-2 rounded-lg border ${severityColors[suggestion.severity]}`}>
                <span className="font-medium">💡 Suggestion:</span> {suggestion.text}
              </div>
            )}

            {/* Quick questions (when no messages) */}
            {messages.length === 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] text-white/45 font-medium uppercase tracking-wider">Quick questions</div>
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="block w-full text-left text-xs text-white/60 hover:text-white hover:bg-white/5 px-3 py-2 rounded-lg transition"
                  >
                    → {q}
                  </button>
                ))}
              </div>
            )}

            {/* Chat messages */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm px-3 py-2 rounded-lg ${
                  msg.role === "user"
                    ? "bg-white/10 text-white ml-8"
                    : "bg-emerald-500/10 text-emerald-100 border border-emerald-500/10 mr-4"
                }`}
              >
                {msg.role === "ai" && <span className="text-[10px] text-emerald-400/60 font-medium block mb-1">AI</span>}
                {msg.text}
                {msg.action && (
                  <button
                    onClick={() => {
                      router.push(msg.action!.route)
                      setOpen(false)
                    }}
                    className="mt-2 block w-full text-left text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-2 rounded-lg transition border border-emerald-500/20"
                  >
                    → {msg.action.label}
                  </button>
                )}
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="bg-emerald-500/10 text-emerald-300 text-sm px-3 py-2 rounded-lg border border-emerald-500/10 mr-4">
                <span className="text-[10px] text-emerald-400/60 font-medium block mb-1">AI</span>
                <span className="animate-pulse">Thinking…</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.12] p-3 bg-white/[0.02]">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendMessage(input)
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about this page…"
                maxLength={1000}
                className="flex-1 bg-white/5 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-emerald-500/50 transition"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-500 text-white text-sm rounded-lg transition"
              >
                ↑
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
