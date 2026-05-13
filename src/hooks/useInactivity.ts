"use client"

import { useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"

const LAST_ACTIVITY_KEY = "_inactivity_last_active"
const WARNING_SHOWN_KEY = "_inactivity_warning_shown"

async function performLogout() {
  const adminSession = localStorage.getItem("admin_session")
  if (adminSession) {
    localStorage.removeItem("admin_session")
    localStorage.removeItem("admin_token")
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {})
  }
  await supabase.auth.signOut()
  for (const key of ["supabase.auth.token", "supabase.auth.token.0", "supabase.auth.token.1"]) {
    document.cookie = `${key}=; path=/; max-age=0; samesite=lax`
  }
  localStorage.removeItem(LAST_ACTIVITY_KEY)
  localStorage.removeItem(WARNING_SHOWN_KEY)
  window.location.href = "/login"
}

export function useInactivity(timeout = 15 * 60 * 1000, warningTime = 14 * 60 * 1000) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const warningTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastResetAt = useRef(0)

  const resetTimer = useCallback(() => {
    clearTimeout(timer.current)
    clearTimeout(warningTimer.current)

    const now = Date.now()
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now))
    localStorage.removeItem(WARNING_SHOWN_KEY)

    warningTimer.current = setTimeout(() => {
      localStorage.setItem(WARNING_SHOWN_KEY, "1")
      window.dispatchEvent(new Event("session_warning"))
    }, warningTime)

    timer.current = setTimeout(() => {
      performLogout()
    }, timeout)
  }, [timeout, warningTime])

  const onFrequentActivity = useCallback(() => {
    const now = Date.now()
    if (now - lastResetAt.current < 750) return
    lastResetAt.current = now
    resetTimer()
  }, [resetTimer])

  // Fallback: on tab focus / visibility restore, check if the timeout already
  // elapsed via the stored timestamp (browsers throttle background timers).
  const checkOnVisible = useCallback(() => {
    if (document.visibilityState !== "visible") return
    const last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) ?? "0", 10)
    if (!last) return
    const elapsed = Date.now() - last
    if (elapsed >= timeout) {
      performLogout()
    } else if (elapsed >= warningTime && !localStorage.getItem(WARNING_SHOWN_KEY)) {
      localStorage.setItem(WARNING_SHOWN_KEY, "1")
      window.dispatchEvent(new Event("session_warning"))
    }
  }, [timeout, warningTime])

  useEffect(() => {
    const directEvents = ["keydown", "click", "touchstart", "touchend"]
    const frequentEvents = ["mousemove", "scroll", "touchmove"]

    directEvents.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    frequentEvents.forEach((e) => window.addEventListener(e, onFrequentActivity, { passive: true }))
    document.addEventListener("visibilitychange", checkOnVisible)
    window.addEventListener("focus", checkOnVisible)

    resetTimer()

    return () => {
      directEvents.forEach((e) => window.removeEventListener(e, resetTimer))
      frequentEvents.forEach((e) => window.removeEventListener(e, onFrequentActivity))
      document.removeEventListener("visibilitychange", checkOnVisible)
      window.removeEventListener("focus", checkOnVisible)
      clearTimeout(timer.current)
      clearTimeout(warningTimer.current)
    }
  }, [resetTimer, onFrequentActivity, checkOnVisible])
}
