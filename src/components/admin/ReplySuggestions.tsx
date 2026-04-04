"use client"

import { useEffect, useState } from "react"
import { getReplyTemplates, type ReplyTemplate } from "@/lib/replyTemplates"
import { getAdminHeaders } from "@/lib/auth/adminSession"

type Props = {
  ticketCategory?: string
  ticketStatus?: string
  onSelect: (text: string) => void
}

export default function ReplySuggestions({ ticketCategory, ticketStatus, onSelect }: Props) {
  const [templates, setTemplates] = useState<ReplyTemplate[]>([])
  const [refined, setRefined] = useState<string[]>([])
  const [refining, setRefining] = useState(false)
  const [showRefined, setShowRefined] = useState(false)

  useEffect(() => {
    const t = getReplyTemplates(ticketCategory)
    setTemplates(t)
    setRefined([])
    setShowRefined(false)
  }, [ticketCategory])

  async function refineWithAI() {
    if (refining || templates.length === 0) return
    setRefining(true)
    try {
      const res = await fetch("/api/admin/ai-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          base: templates.map((t) => t.content),
          context: {
            ticket_type: ticketCategory || "general",
            status: ticketStatus || "open",
          },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.suggestions?.length) {
          setRefined(data.suggestions)
          setShowRefined(true)
        }
      }
    } catch {
      // Fall back to templates
    }
    setRefining(false)
  }

  const displayItems = showRefined && refined.length > 0
    ? refined.map((content, i) => ({ label: templates[i]?.label || `Reply ${i + 1}`, content }))
    : templates.map((t) => ({ label: t.label, content: t.content }))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/30 font-medium uppercase tracking-wider">
          Quick replies
        </span>
        <button
          onClick={refineWithAI}
          disabled={refining}
          className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition font-medium disabled:opacity-50"
        >
          {refining ? "🤖 Refining..." : showRefined ? "🤖 Refined ✓" : "🤖 AI Refine"}
        </button>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {displayItems.map((item, i) => (
          <button
            key={i}
            onClick={() => onSelect(item.content)}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-white/5 transition text-left max-w-[280px]"
            title={item.content}
          >
            <span className="font-medium text-white/40 mr-1">{item.label}:</span>
            <span className="truncate">{item.content.slice(0, 60)}…</span>
          </button>
        ))}
      </div>
    </div>
  )
}
