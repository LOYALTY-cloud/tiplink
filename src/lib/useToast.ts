"use client";

import { useEffect, useState } from "react";

export function useToast(timeoutMs = 1800) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), timeoutMs);
    return () => clearTimeout(t);
  }, [toast, timeoutMs]);

  return {
    toast,
    show: (msg: string) => setToast(msg),
    clear: () => setToast(null),
  };
}
