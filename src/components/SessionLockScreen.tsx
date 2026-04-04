"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { unlockSession, getLockTimestamp, getLockReason, type LockReason } from "@/lib/sessionLock"
import { supabase } from "@/lib/supabase/client"

const AUTO_LOGOUT_MS = 10 * 60 * 1000 // 10 min after lock

interface Props {
  email?: string
}

export default function SessionLockScreen({ email }: Props) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [lastActive, setLastActive] = useState("")
  const [reason, setReason] = useState<string | null>(null)
  const autoLogoutTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const router = useRouter()

  // Auto-logout countdown after lock
  useEffect(() => {
    const lockTs = getLockTimestamp()
    const lockReason = getLockReason()
    setReason(lockReason)

    // Security lock = force logout immediately
    if (lockReason === "security") {
      handleLogout()
      return
    }

    if (lockTs) {
      const elapsed = Date.now() - lockTs
      const ago = Math.round(elapsed / 60_000)
      setLastActive(ago < 1 ? "Just now" : `${ago} min ago`)

      // Manual lock = no auto-logout (user explicitly locked)
      if (lockReason !== "manual") {
        const remaining = Math.max(AUTO_LOGOUT_MS - elapsed, 0)
        autoLogoutTimer.current = setTimeout(() => {
          handleLogout()
        }, remaining)
      }
    }

    // Update last-active display every 30s
    const interval = setInterval(() => {
      const ts = getLockTimestamp()
      if (ts) {
        const ago = Math.round((Date.now() - ts) / 60_000)
        setLastActive(ago < 1 ? "Just now" : `${ago} min ago`)
      }
    }, 30_000)

    return () => {
      clearTimeout(autoLogoutTimer.current)
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUnlock() {
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        setPassword("")
        clearTimeout(autoLogoutTimer.current)
        unlockSession()
      } else {
        setError("Incorrect password")
      }
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    unlockSession()
    await supabase.auth.signOut()
    router.replace("/login")
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[100]">
      <div className="bg-black border border-white/10 p-6 rounded-2xl text-white w-[320px]">
        <h2 className="text-lg font-semibold mb-2">🔒 Session Locked</h2>

        {reason && (
          <p className="text-[11px] text-white/30 mb-2 uppercase tracking-wide">Reason: {reason}</p>
        )}

        {email && (
          <p className="text-sm text-white/80 mb-1 truncate">{email}</p>
        )}

        {lastActive && (
          <p className="text-[11px] text-white/40 mb-3">Last active: {lastActive}</p>
        )}

        <p className="text-xs text-white/60 mb-4">
          Re-enter your password to continue
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleUnlock()
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white/5 border border-white/10 px-3 py-2 rounded-xl mb-2 text-white placeholder:text-white/30"
            placeholder="Password"
            autoFocus
          />

          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-emerald-500 text-black py-2 rounded-xl font-medium disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Unlock"}
          </button>
        </form>

        <button
          onClick={handleLogout}
          className="w-full mt-2 text-xs text-white/60 hover:text-white/80 transition"
        >
          Log out instead
        </button>
      </div>
    </div>
  )
}
