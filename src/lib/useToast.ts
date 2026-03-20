"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export type Toast = { message: string; type: ToastType };

export function useToast(timeoutMs = 2500) {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), timeoutMs);
    return () => clearTimeout(t);
  }, [toast, timeoutMs]);

  return {
    toast,
    show: (message: string, type: ToastType = "info") =>
      setToast({ message, type }),
    clear: () => setToast(null),
  };
}
