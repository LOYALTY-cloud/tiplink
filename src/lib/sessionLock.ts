let isLocked = false

const LOCK_KEY = "session_locked"
const LOCK_TIME_KEY = "session_locked_at"
const LOCK_REASON_KEY = "session_lock_reason"

export type LockReason = "inactivity" | "manual" | "security"

/** Fire-and-forget audit log to backend */
function logSessionEvent(event: string, reason: LockReason) {
  fetch("/api/session/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, reason, timestamp: Date.now() }),
  }).catch(() => {})
}

export function lockSession(reason: LockReason = "inactivity") {
  isLocked = true
  localStorage.setItem(LOCK_KEY, "true")
  localStorage.setItem(LOCK_TIME_KEY, Date.now().toString())
  localStorage.setItem(LOCK_REASON_KEY, reason)
  logSessionEvent("lock", reason)
  window.dispatchEvent(new Event("session_locked"))
}

export function unlockSession() {
  const reason = getLockReason()
  isLocked = false
  localStorage.removeItem(LOCK_KEY)
  localStorage.removeItem(LOCK_TIME_KEY)
  localStorage.removeItem(LOCK_REASON_KEY)
  if (reason) logSessionEvent("unlock", reason)
  window.dispatchEvent(new Event("session_unlocked"))
}

export function getSessionLock() {
  return isLocked || localStorage.getItem(LOCK_KEY) === "true"
}

export function getLockTimestamp(): number | null {
  const ts = localStorage.getItem(LOCK_TIME_KEY)
  return ts ? Number(ts) : null
}

export function getLockReason(): LockReason | null {
  return (localStorage.getItem(LOCK_REASON_KEY) as LockReason) || null
}

/** Call this to prevent locking during critical flows (payments, uploads, etc.) */
export function blockLock() {
  (window as any).__BLOCK_LOCK__ = true
}

/** Re-enable locking after critical flow completes */
export function unblockLock() {
  (window as any).__BLOCK_LOCK__ = false
}

export function isLockBlocked(): boolean {
  return !!(window as any).__BLOCK_LOCK__
}
