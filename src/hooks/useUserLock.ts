"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export type UserLockReason = "idle" | "tab_switch" | "manual";

const LOCK_KEY            = "user_lock_reason";   // localStorage
const LAST_ACTIVE_KEY     = "user_last_active";   // localStorage
const TAB_HIDDEN_AT_KEY   = "user_tab_hidden_at"; // localStorage

const WARN_MS             = 4 * 60 * 1000;  // 4 min → warning
const IDLE_LOCK_MS        = 5 * 60 * 1000;  // 5 min → soft lock
const HARD_LOGOUT_MS      = 8 * 60 * 1000;  // 8 min → full logout
const TAB_SWITCH_GRACE_MS = 3 * 60 * 1000;  // 3 min → grace before tab-switch lock

async function performLogout() {
  localStorage.removeItem(LOCK_KEY);
  localStorage.removeItem(LAST_ACTIVE_KEY);
  for (const key of ["supabase.auth.token", "supabase.auth.token.0", "supabase.auth.token.1"]) {
    document.cookie = `${key}=; path=/; max-age=0; samesite=lax`;
  }
  await supabase.auth.signOut();
  window.location.href = "/login";
}

export function useUserLock(enabled: boolean) {
  const [isLocked, setIsLocked]     = useState(false);
  const [lockReason, setLockReason] = useState<UserLockReason>("idle");

  const idleLockRef      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warnRef          = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hardLogoutRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tabSwitchLockRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastResetRef     = useRef<number>(0);

  // ── Internal lock ────────────────────────────────────────────────────────
  const lock = useCallback((reason: UserLockReason) => {
    localStorage.setItem(LOCK_KEY, reason);
    setLockReason(reason);
    setIsLocked(true);
    clearTimeout(idleLockRef.current);
    clearTimeout(warnRef.current);
    clearTimeout(hardLogoutRef.current);
    clearTimeout(tabSwitchLockRef.current);
  }, []);

  // ── Reset idle timers ────────────────────────────────────────────────────
  const resetTimers = useCallback(() => {
    if (!enabled) return;
    clearTimeout(idleLockRef.current);
    clearTimeout(warnRef.current);
    clearTimeout(hardLogoutRef.current);

    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));

    warnRef.current = setTimeout(() => {
      window.dispatchEvent(new Event("session_warning"));
    }, WARN_MS);

    idleLockRef.current = setTimeout(() => {
      lock("idle");
    }, IDLE_LOCK_MS);

    hardLogoutRef.current = setTimeout(() => {
      void performLogout();
    }, HARD_LOGOUT_MS);
  }, [enabled, lock]);

  // ── Throttled activity handler ───────────────────────────────────────────
  const onActivity = useCallback(() => {
    if (!enabled) return;
    const lockedNow = localStorage.getItem(LOCK_KEY);
    if (lockedNow) return;
    const now = Date.now();
    if (now - lastResetRef.current < 1000) return;
    lastResetRef.current = now;
    resetTimers();
  }, [enabled, resetTimers]);

  // ── Visibility lock (5-min grace period) ────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        localStorage.setItem(TAB_HIDDEN_AT_KEY, String(Date.now()));
        tabSwitchLockRef.current = setTimeout(() => {
          lock("tab_switch");
        }, TAB_SWITCH_GRACE_MS);
        // Pause all timers while hidden
        clearTimeout(idleLockRef.current);
        clearTimeout(warnRef.current);
        clearTimeout(hardLogoutRef.current);
      } else {
        clearTimeout(tabSwitchLockRef.current);
        localStorage.removeItem(TAB_HIDDEN_AT_KEY);

        const reason = localStorage.getItem(LOCK_KEY) as UserLockReason | null;
        if (reason) {
          lock(reason);
          return;
        }

        const last    = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) ?? "0", 10);
        const elapsed = last ? Date.now() - last : Infinity;
        if (elapsed >= HARD_LOGOUT_MS) {
          void performLogout();
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

  // ── On mount: restore lock state or start timers ─────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const reason = localStorage.getItem(LOCK_KEY) as UserLockReason | null;
    if (reason) {
      lock(reason);
      return;
    }

    const last = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) ?? "0", 10);
    if (last) {
      const elapsed = Date.now() - last;
      if (elapsed >= HARD_LOGOUT_MS) { void performLogout(); return; }
      if (elapsed >= IDLE_LOCK_MS)   { lock("idle"); return; }
    }

    resetTimers();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activity listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
      // Allows embedded experiences (e.g. Stripe iframe) to ping activity.
      "session_activity",
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [enabled, onActivity]);

  // ── Unlock: re-authenticate with Supabase ───────────────────────────────
  const unlock = useCallback(
    async (password: string): Promise<{ ok: boolean; error?: string }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        localStorage.removeItem(LOCK_KEY);
        localStorage.removeItem(LAST_ACTIVE_KEY);
        window.location.href = "/login";
        return { ok: false, error: "Session expired." };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (error) return { ok: false, error: "Incorrect password. Try again." };

      localStorage.removeItem(LOCK_KEY);
      setIsLocked(false);
      resetTimers();
      return { ok: true };
    },
    [resetTimers],
  );

  return { isLocked, lockReason, unlock, resetActivity: resetTimers };
}
