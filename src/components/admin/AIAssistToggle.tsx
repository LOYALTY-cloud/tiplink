"use client"

import { useEffect, useState } from "react"
import { isAIAssistMode, setAIAssistMode } from "@/lib/aiAssistMode"

export default function AIAssistToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(isAIAssistMode())

    const handler = () => setEnabled(isAIAssistMode())
    window.addEventListener("aiAssistModeChange", handler)
    return () => window.removeEventListener("aiAssistModeChange", handler)
  }, [])

  function toggle() {
    setAIAssistMode(!enabled)
  }

  return (
    <button
      onClick={toggle}
      className={`text-xs px-3 py-1 rounded-lg border transition ${
        enabled
          ? "bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
          : "bg-white/5 border-white/10 text-white/50"
      }`}
    >
      🧠 AI Assist: {enabled ? "ON" : "OFF"}
    </button>
  )
}
