"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";

export type LockReason = "idle" | "tab_switch" | "manual";

const LOCK_KEY              = "admin_lock_reason";  // sessionStorage
const IDLE_LOCK_MS          = 5  * 60 * 1000;       // 5 min  → soft lock
const WARN_MS               = 4  * 60 * 1000;       // 4 min  → warning event
const HARD_LOGOUT_MS        = 10 * 60 * 1000;       // 10 min → full logout
const TAB_SWITCH_GRACE_MS   = 3  * 60 * 1000;       // 3 min  → grace before tab-switch lock
const LAST_ACTIVE_KEY       = "admin_last_active";   // sessionStorage
const TAB_HIDDEN_AT_KEY     = "admin_tab_hidden_at"; // sessionStorage

function performLogout() {
  sessionStorage.removeItem(LOCK_KEY);
  sessionStorage.removeItem(LAST_ACTIVE_KEY);
  localStorage.removeItem("admin_session");
  localStorage.removeItem("admin_token");
  fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/admin/login";
}

export function useAdminLock(enabled: boolean) {
  const [isLocked, setIsLocked]     = useState(false);
  const [lockReason, setLockReason] = useState<LockReason>("idle");

  const idleLockRef       = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warnRef           = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hardLogoutRef     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tabSwitchLockRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastResetRef      = useRef<number>(0);

  // ── Internal lock ─────────────────────────────────────────────────────────
  const lock = useCallback((reason: LockReason) => {
    sessionStorage.setItem(LOCK_KEY, reason);
    setLockReason(reason);
    setIsLocked(true);
    // Stop ALL timers while locked — they restart on unlock.
    // Critically, hardLogoutRef must be cleared so the hard-logout doesn't
    // fire while the lock screen is visible, causing a surprise redirect to login.
    clearTimeout(idleLockRef.current);
    clearTimeout(warnRef.current);
    clearTimeout(hardLogoutRef.current);
    clearTimeout(tabSwitchLockRef.current);
  }, []);

  // ── Reset idle timers ─────────────────────────────────────────────────────
  const resetTimers = useCallback(() => {
    if (!enabled) return;
    clearTimeout(idleLockRef.current);
    clearTimeout(warnRef.current);
    clearTimeout(hardLogoutRef.current);

    const now = Date.now();
    sessionStorage.setItem(LAST_ACTIVE_KEY, String(now));

    warnRef.current = setTimeout(() => {
      window.dispatchEvent(new Event("session_warning"));
    }, WARN_MS);

    idleLockRef.current = setTimeout(() => {
      lock("idle");
    }, IDLE_LOCK_MS);

    hardLogoutRef.current = setTimeout(() => {
      performLogout();
    }, HARD_LOGOUT_MS);
  }, [enabled, lock]);

  // ── Throttled activity handler ────────────────────────────────────────────
  const onActivity = useCallback(() => {
    if (!enabled) return;
    // Don't reset if locked — activity should not auto-unlock
    const lockedNow = sessionStorage.getItem(LOCK_KEY);
    if (lockedNow) return;
    const now = Date.now();
    if (now - lastResetRef.current < 1000) return;
    lastResetRef.current = now;
    resetTimers();
  }, [enabled, resetTimers]);

  // ── Visibility lock (3-min grace period) ────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        // Record when the tab was hidden
        sessionStorage.setItem(TAB_HIDDEN_AT_KEY, String(Date.now()));
        // Schedule lock after grace period
        tabSwitchLockRef.current = setTimeout(() => {
          lock("tab_switch");
        }, TAB_SWITCH_GRACE_MS);
        // Pause ALL timers while hidden — including hardLogoutRef so the
        // hard-logout doesn't fire while the admin is on another tab.
        // Elapsed time is checked via LAST_ACTIVE_KEY when tab becomes visible.
        clearTimeout(idleLockRef.current);
        clearTimeout(warnRef.current);
        clearTimeout(hardLogoutRef.current);
      } else {
        // Tab became visible — cancel pending tab-switch lock
        clearTimeout(tabSwitchLockRef.current);
        sessionStorage.removeItem(TAB_HIDDEN_AT_KEY);

        // Check if lock was already set (grace period elapsed before return)
        const reason = sessionStorage.getItem(LOCK_KEY) as LockReason | null;
        if (reason) {
          lock(reason); // use lock() so all timers are cleared
          return;
        }

        // Check if idle timeout elapsed while tab was hidden
        const last = parseInt(sessionStorage.getItem(LAST_ACTIVE_KEY) ?? "0", 10);
        const elapsed = last ? Date.now() - last : Infinity;
        if (elapsed >= HARD_LOGOUT_MS) {
          performLogout();
        } else if (elapsed >= IDLE_LOCK_MS) {
          lock("idle");
        } else {
          resetTimers();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, lock, resetTimers]);

  // ── On mount: restore lock state if session was locked ───────────────────
  useEffect(() => {
    if (!enabled) return;

    const reason = sessionStorage.getItem(LOCK_KEY) as LockReason | null;
    if (reason) {
      lock(reason); // use lock() so all timers are cleared
      return; // Don't start idle timers until unlocked
    }

    // Check elapsed since last activity (handles hard refresh)
    const last = parseInt(sessionStorage.getItem(LAST_ACTIVE_KEY) ?? "0", 10);
    if (last) {
      const elapsed = Date.now() - last;
      if (elapsed >= HARD_LOGOUT_MS) { performLogout(); return; }
      if (elapsed >= IDLE_LOCK_MS)   { lock("idle"); return; }
    }

    resetTimers();
  }, [enabled]);

  // ── Activity listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [enabled, onActivity]);

  // ── Unlock ────────────────────────────────────────────────────────────────
  const unlock = useCallback(async (passcode: string): Promise<{ ok: boolean; error?: string; logout?: boolean }> => {
    try {
      const res = await fetch("/api/admin/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Invalid passcode", logout: data.logout === true };
      }

      // Unlock success
      sessionStorage.removeItem(LOCK_KEY);
      setIsLocked(false);
      resetTimers();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Try again." };
    }
  }, [resetTimers]);

  return { isLocked, lockReason, unlock, resetActivity: resetTimers };
}
