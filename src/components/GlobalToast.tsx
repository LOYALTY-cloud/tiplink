"use client";

import { useEffect, useState, useCallback } from "react";

type GlobalToastItem = {
  id: number;
  title?: string;
  message: string;
  type: "success" | "error" | "info";
};

type GlobalToastPayload = {
  title?: string;
  message: string;
  type?: "success" | "error" | "info";
};

let _id = 0;

// Fire from anywhere: window.dispatchEvent(new CustomEvent("global-toast", { detail: { message, type } }))
export function GlobalToastProvider() {
  const [toasts, setToasts] = useState<GlobalToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as GlobalToastPayload;
      if (!detail?.message) return;
      const id = ++_id;
      const type = (detail.type === "success" || detail.type === "error" || detail.type === "info") ? detail.type : "error";
      setToasts((prev) => [...prev.slice(-4), { id, title: detail.title, message: detail.message, type }]);
      setTimeout(() => dismiss(id), 4000);
    };
    window.addEventListener("global-toast", handler);
    return () => window.removeEventListener("global-toast", handler);
  }, [dismiss]);

  if (toasts.length === 0) return null;

  const typeStyles: Record<string, string> = {
    success: "bg-emerald-500/90 text-white",
    error: "bg-red-500/90 text-white",
    info: "bg-white/10 text-white backdrop-blur-md",
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t, i) => (
        <div
          key={t.id}
          style={{ animationDelay: `${i * 100}ms` }}
          className={`pointer-events-auto px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg opacity-0 animate-[toastIn_0.3s_ease-out_forwards] cursor-pointer ${typeStyles[t.type]}`}
          onClick={() => dismiss(t.id)}
          role="status"
        >
          {t.type === "error" && <span className="mr-1.5">⚠️</span>}
          {t.type === "success" && <span className="mr-1.5">✓</span>}
          {t.title ? <span className="mr-1.5 font-semibold">{t.title}:</span> : null}
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Convenience function — call from anywhere in client code */
export function showGlobalToast(
  payload: string | GlobalToastPayload,
  type: "success" | "error" | "info" = "error",
) {
  if (typeof window !== "undefined") {
    const detail = typeof payload === "string"
      ? { message: payload, type }
      : { message: payload.message, title: payload.title, type: payload.type ?? type };
    window.dispatchEvent(new CustomEvent("global-toast", { detail }));
  }
}
