"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastType = "success" | "error" | "info";

export type Toast = { id: number; message: string; type: ToastType };

let _nextId = 0;

export function useToast(timeoutMs = 2500) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = ++_nextId;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]); // keep max 5
    const timer = setTimeout(() => dismiss(id), timeoutMs);
    timers.current.set(id, timer);
  }, [dismiss, timeoutMs]);

  const clear = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    return () => { timers.current.forEach((t) => clearTimeout(t)); };
  }, []);

  // Backward compat: expose single `toast` as last item
  const toast = toasts.length > 0 ? toasts[toasts.length - 1] : null;

  return { toast, toasts, show, dismiss, clear };
}

