"use client"

import { useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"

export function useInactivity(timeout = 15 * 60 * 1000, warningTime = 14 * 60 * 1000) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const warningTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const resetTimer = useCallback(() => {
    clearTimeout(timer.current)
    clearTimeout(warningTimer.current)

    warningTimer.current = setTimeout(() => {
      window.dispatchEvent(new Event("session_warning"))
    }, warningTime)

    timer.current = setTimeout(async () => {
      // Auto-logout on inactivity
      // Check if this is admin or user and handle accordingly
      const adminSession = localStorage.getItem("admin_session")
      if (adminSession) {
        localStorage.removeItem("admin_session")
      }
      await supabase.auth.signOut()
      window.location.href = "/login"
    }, timeout)
  }, [timeout, warningTime])

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"]
    events.forEach((e) => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      clearTimeout(timer.current)
      clearTimeout(warningTimer.current)
    }
  }, [resetTimer])
}
