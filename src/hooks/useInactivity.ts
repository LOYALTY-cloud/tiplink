"use client"

import { useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"

export function useInactivity(timeout = 15 * 60 * 1000, warningTime = 14 * 60 * 1000) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const warningTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastResetAt = useRef(0)

  const resetTimer = useCallback(() => {
    clearTimeout(timer.current)
    clearTimeout(warningTimer.current)

    warningTimer.current = setTimeout(() => {
      window.dispatchEvent(new Event("session_warning"))
    }, warningTime)

    timer.current = setTimeout(async () => {
      // Auto-logout on inactivity
      const adminSession = localStorage.getItem("admin_session")
      if (adminSession) {
        // Clear localStorage and HTTP-only cookie
        localStorage.removeItem("admin_session")
        localStorage.removeItem("admin_token")
        await fetch("/api/admin/logout", { method: "POST" }).catch(() => {})
      }
      await supabase.auth.signOut()
      for (const key of ["supabase.auth.token", "supabase.auth.token.0", "supabase.auth.token.1"]) {
        document.cookie = `${key}=; path=/; max-age=0; samesite=lax`;
      }
      window.location.href = "/login"
    }, timeout)
  }, [timeout, warningTime])

  const onFrequentActivity = useCallback(() => {
    const now = Date.now()
    if (now - lastResetAt.current < 750) return
    lastResetAt.current = now
    resetTimer()
  }, [resetTimer])

  useEffect(() => {
    const directEvents = ["keydown", "click", "touchstart", "touchend"]
    const frequentEvents = ["mousemove", "scroll", "touchmove"]

    directEvents.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    frequentEvents.forEach((e) => window.addEventListener(e, onFrequentActivity, { passive: true }))
    resetTimer()

    return () => {
      directEvents.forEach((e) => window.removeEventListener(e, resetTimer))
      frequentEvents.forEach((e) => window.removeEventListener(e, onFrequentActivity))
      clearTimeout(timer.current)
      clearTimeout(warningTimer.current)
    }
  }, [resetTimer, onFrequentActivity])
}
