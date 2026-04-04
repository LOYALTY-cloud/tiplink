"use client";

import type { Toast } from "@/lib/useToast";

const typeStyles: Record<string, string> = {
  success: "bg-emerald-500/90 text-white",
  error: "bg-red-500/90 text-white",
  info: "bg-white/10 text-white backdrop-blur-md",
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss?: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t, i) => (
        <div
          key={t.id}
          style={{ animationDelay: `${i * 120}ms` }}
          className={`pointer-events-auto px-4 py-2 rounded-xl text-sm font-medium shadow-lg opacity-0 animate-[toastIn_0.3s_ease-out_forwards] ${typeStyles[t.type] ?? typeStyles.info}`}
          onClick={() => onDismiss?.(t.id)}
          role="status"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
